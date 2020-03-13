import Emitter from 'eventemitter3';
import { zoom as d3Zoom, zoomIdentity } from 'd3-zoom';
import { scaleLinear as d3ScaleLinear } from 'd3-scale';
import { axisRight as d3AxisRight, axisBottom as d3AxisBottom } from 'd3-axis';
import { formatYear, formatMonth, formatMonthDay } from './utils.mjs';
import { timeYear } from 'd3-time';
import Timeline from './timeline.mjs';
import Popup from './popup.mjs';
import Player from './player.mjs';


/**
 * The MasterTimeline represents our virtual layout. This is an x/y space where
 * time increases as we move down. This is where we handle our high-level
 * zooming and panning using d3's zoom handlers.
 */
export default class MasterTimeline {
  /**
   * @param {d3.Selection} parent - append the master timeline to this. for now,
   *        this should be a div, NOT an SVG, because we will append non-svg
   *        elements to it.
   */
  constructor(parent, drawDebugAxes) {
    this.parent = parent;
    this.drawDebugAxes = !!drawDebugAxes;
    this.emitter = new Emitter();
    this.content = {};
    this.lastZoomTransform = zoomIdentity;
    this.svg = this.parent.append('svg')
      .attr('class', 'media-timeline');

    this.width = this.svg.node().clientWidth;
    this.height = this.svg.node().clientHeight;

    this.g = this.svg.append('g')
      .attr('class', 'master-timeline');
    this.yScaleInitial = 
    this.yScale = d3ScaleLinear()
      .domain([1850, 2050])     // Domain is in 'float years'
      .range([0, this.height]); // Range is in pixels.
    this.yAxis = d3AxisRight(this.yScale)
      .ticks(10)
      .tickSizeOuter(0);
    this.yAxisGroup = this.svg.append('g')
      .attr('class', 'y axis')
      .attr('transform', 'translate(0,0)')

    this.xScaleInitial =
    this.xScale = d3ScaleLinear()
      .domain([0, this.width])
      .range([0, this.width])
    this.xAxis = d3AxisBottom(this.xScale)
      .ticks(10)
      .tickSizeOuter(0);
    this.xAxisGroup = this.svg.append('g')
      .attr('class', 'x axis')
      .attr('transform', 'translate(0,0)')

    // Configure Zooming and Panning. Note that because events will never
    // trigger both zoom and a drag handlers, I am extracting drag behavior from
    // zoom events.
    this.zoom = d3Zoom()
      .filter(() => !d3.event.button)
      .wheelDelta(() => {
        // Browsers have agreed to emit zoom events with the ctrlKey down on a
        // trackpad pinch gesture.
        const isTrackPadPinch = d3.event.ctrlKey;
        const pixelRatio = isTrackPadPinch ? 0.016 : 0.002; // pinchZoomSpeed : wheelZoomSpeed
        return -d3.event.deltaY * (d3.event.deltaMode === 1 ? 0.05 : d3.event.deltaMode ? 1 : pixelRatio);
      })
      .scaleExtent([0.4, 60])
      .translateExtent([
        [0, this.yScale(1400)],
        [0, this.yScale(2300)]])
      .on('start.emit', () => { this.emitter.emit('zoom', d3.event) })
      .on('zoom.emit', () => { this.emitter.emit('zoom', d3.event) })
      .on('end.emit', () => { this.emitter.emit('zoom', d3.event) })
      .touchable(() => true); // this is VERY HACKY, and really just for testing the CHROME

    // setup event handlers, add transform this.svg.property('__zoom', transform)
    this.svg.call(this.zoom);

    // setup event handlers
    window.addEventListener('resize', () => { this.onResize(); });

    // setup the popup object
    this.popup = new Popup(this.parent);
    this.player = new Player(this.parent);
    this.onResize();

    // Setup some kefir streams
    this.animationStream = Kefir.stream(emitter => {
      const step = function(timeMS) {
        emitter.emit(timeMS);
        window.requestAnimationFrame(step);
      }
      window.requestAnimationFrame(step);
    });

    this.mouseIsDown = false;
    this.zoomStream = Kefir.fromEvents(this.emitter, 'zoom');
    this.zoomTouchStream = Kefir.fromEvents(this.emitter, 'zoom-touch');
    this.zoomStream.onValue((event) => { 
      // d3 zoom events https://github.com/d3/d3-zoom#api-reference
      // mouse AND touch DOM events trigger these d3 zoom events
      if (event && event.type === 'zoom') {
        this.lastZoomTransform = event.transform;
        // Handle Y-Axis
        this.yScale = this.lastZoomTransform.rescaleY(this.yScaleInitial);
        this.yAxis.scale(this.yScale);
      }

      if (!event.sourceEvent) return;
      // mousedown, touchstart, wheel, dblclick can all trigger start events
      if (event.sourceEvent.type === 'mousedown' && event.type === 'start')
        this.mouseIsDown = true;
      if (event.sourceEvent.type === 'mouseup' && event.type === 'end')
        this.mouseIsDown = false;

      // Handle X-Axis. If this is a mouse or wheel event we can update the
      // xScale here. Touch events do have have a delta, so I handle them in a
      // stream where I can use .slidingWindow to easily access previous events
      let dx = null;
      if (event.sourceEvent.type === 'mousemove') dx = event.sourceEvent.movementX;
      else if (event.sourceEvent.type === 'wheel') dx = -event.sourceEvent.deltaX;
      else if (event.sourceEvent.type.slice(0, 5) === 'touch') this.emitter.emit('zoom-touch', event);
      if (dx) {
        this.xScale.domain(this.xScale.domain().map(v => v - dx));
        this.xAxis.scale(this.xScale); // update X-Axis domain
        this.emitter.emit('update');
      }
    });
    this.zoomTouchStream.slidingWindow(2,2)
      .filter((v) => v[1].sourceEvent.touches.length === 1 && v[0].sourceEvent.touches.length === 1)
      .onValue((v) => {
        if (v[1].sourceEvent.type === 'touchstart') return;
        const dx = v[1].sourceEvent.touches[0].clientX - v[0].sourceEvent.touches[0].clientX
        this.xScale.domain(this.xScale.domain().map(v => v - dx));
        this.xAxis.scale(this.xScale) // Update X-Axis domain
      });

    this.zoomStream.bufferBy(this.animationStream).onValue((events) => {
      // events is an array of d3.events. See: events[0].sourceEvent.timeStamp
      if (!events.length) return;
      this.update();
      this.emitter.emit('update');
    });

    // Handle mouse stuff
    this.clickPool = new Kefir.pool();
    this.mouseoverPool = new Kefir.pool();
    this.playPool = new Kefir.pool();
    this.pausePool = new Kefir.pool();
    this.mouseoverPool.plug(this.popup.mouseStream);
    this.mouseOut = this.mouseoverPool.filter(v => !v);
    this.mouseOver = this.mouseoverPool.filter(v => v);
    this.mouseCurrent = null; // What is the mouse over? null || TimelineEvent
    this.mouseoverPool.onValue(v => this.mouseCurrent = v && v.timelineEvent);

    // show/hide popup. v is the customized object that Timeline outputs for
    // on mouseover events. See timeline's .on('mouseover') handler in its 
    // constructor for details.
    this.mouseOver.onValue(v =>  {
      if (!v.timelineEvent || this.mouseIsDown) return;
      this.popup.setEvent(v.timelineEvent);
      this.popup.show();
      const marginLeft = 12; // give a little breathing room
      const x = this.xScale(v.x + v.timelineEvent.width) + marginLeft;
      const y = v.y;

      this.popup.worldXY = this.screenToWorld([x, y]);
      this.popup.position(x, y);
    });
    this.mouseoverPool.sampledBy(this.mouseOut.debounce(550))
      .onValue((v) =>  {
        if (v) return;
        this.popup.hide();
        this.popup.worldXY = null;
      });

    // click handler
    this.clickPool.onValue(v => {
      console.log('click:', v.title);
      let me = null;
      if (v.videoElement) me = v.videoElement;
      else if (v.audioElement) me = v.audioElement;
      if (!me) return;

      // Rather than using this.player here, just call play/pause on the media
      // element directly. This allows the event to propagate to the master
      // timeline's playPool handler.
      const isPlaying = !!(me.currentTime > 0 && !me.paused && !me.ended && me.readyState > 2);
      isPlaying ? me.pause() : me.play();
      // NOTE: This will trigger a this.playPool or this.pausePool event
    });

    // If there is another media element playing, pause it. This might seem a
    // little roundabout, but it ensures that we get correct behavior even when
    // we are using the built in controls.
    this.playPool.onValue(event => { this.player.play(event.target) });
  }

  getPixelsPerYear() {
    const r = this.yScale.range();
    const d = this.yScale.domain()
    return (r[1] - r[0]) / (d[1] - d[0]);
  }

  worldToScreen(xy) { return [this.xScale(xy[0]), this.yScale(xy[1])]; }
  screenToWorld(xy) { return [this.xScale.invert(xy[0]), this.yScale.invert(xy[1])]; }

  onResize() {
    this.width  = this.svg.node().clientWidth;
    this.height = this.svg.node().clientHeight;
    const newDomain = [
      this.yScaleInitial.invert(0),
      this.yScaleInitial.invert(this.height)
    ];
    const newRange = [0, this.height];
    this.yScaleInitial
      .domain(newDomain)
      .range(newRange)
    // Note: updating the yScale and yAxis is copy/pasted from the zoom handler.
    // In the long run, we may want a onResize Kefir Stream, so we are DRY. That
    // would also let us to wait for the an animation frame before this.update.
    this.yScale = this.lastZoomTransform.rescaleY(this.yScaleInitial);
    this.yAxis.scale(this.yScale);
  }

  /**
   * Add a timeline
   * @param {String} name - name of the timeline
   * @param {Object} data - timeline data
   */
  addTimeline(name, data, options) {
    options = options || {};
    if (!options.title) options.title = name;
    const count = Object.keys(this.content).length;
    options.left = 80 + 390 * count;
    const timeline = new Timeline(this.g, options);
    this.content[name] = { timeline, data }
    this.mouseoverPool.plug(timeline.mouseoverStream);
    this.clickPool.plug(timeline.clickStream);
    this.playPool.plug(timeline.playPool);
    this.pausePool.plug(timeline.pausePool);
    timeline.data(data);
  }

  size() {
    let count = 0;
    for (let name of Object.keys(this.content)) count += this.content[name].data.length;
    return count;
  }

  update() {
    this.drawDebugAxes && this.yAxisGroup.call(this.yAxis); // update debug y-axis
    this.drawDebugAxes && this.xAxisGroup.call(this.xAxis); // update debug x-axis
    this.g.attr('transform', `translate(${this.xScale(0)},0)`)
    const style  = getStyle(this.getPixelsPerYear());
    const ticks  = style.ticks;
    const format = style.eventFormat;
    for (var key in this.content) {
      const timeline = this.content[key].timeline;
      timeline.yAxis.ticks(ticks);
      timeline.eventAxis.tickFormat(format);
      timeline.rescale(this.yScale);
      timeline.update();
    }
    if (this.popup.worldXY) {
      const screenXY = this.worldToScreen(this.popup.worldXY);
      this.popup.position(screenXY[0], screenXY[1]);
    }
  }
}

const formatSmart = function(date) { 
  if (!date.precision || date.precision === 'day') return formatMonthDay(date);
  if (date.precision === 'year') return formatYear(date);
  if (date.precision === 'month') return formatMonth(date);
}

const styles = [
  { ticks: timeYear.every(10), eventFormat: formatYear },
  { ticks: timeYear.every(1),  eventFormat: formatSmart },
];

const getStyle = (pixelsPerYear) => {
  let i = Math.floor(pixelsPerYear / 50)
  i = Math.min(styles.length - 1, i);
  i = Math.max(0, i);
  return styles[i];
};
