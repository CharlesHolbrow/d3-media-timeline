import { dateToYearFloat, yearFloatToDate } from './utils.mjs';
import Emitter from 'eventemitter3';

/**
 * Calculate the overlap on y-axis (if any) between two bounding box objects
 * returned by SVGElement.getBBox(). However, they really can be any object
 * that has both a .y and a .height.
 * @param {Object} b0 - .x, .y, .width, .height
 * @param {Object} b1 - .x, .y, .width, .height
 * @returns {Number} the number of pixels that overlap on the y axis
 */
const overlapY = function(b0, b1) {
  // Note: getBBox is an svg method. getBoundingClientRect is dom method.
  const b1Bottom = b1.y + b1.height;
  const b0Bottom = b0.y + b0.height;
  const overlapA = (b1.y >= b0.y && b1.y < b0Bottom) ? b0Bottom - b1.y : 0;
  const overlapB = (b1Bottom > b0.y && b1Bottom <= b0Bottom) ? b1Bottom - b0.y : 0;
  return (overlapA > overlapB) ? overlapA : overlapB;
}

export default class Timeline {
  /**
   * @param {d3.Selection} parent
   */
  constructor(parent, options = {}) {
    const config = this.config = {
      start: new Date(1800, 0, 1),
      end: new Date(2020, 0, 1),
      left: 0,        // offset timeline from left edge of the SVG
      eventsLeft: 50, // offset events from left edge of timeline
      title: '',
    }
    Object.assign(config, options)
    this.rangeStart = 0;

    this.all = null;

    this.gOuter = parent.append('g')
      .attr('class', 'timeline outer')
      .attr('transform', `translate(${config.left},${0})`)

    this.events = this.gOuter.append('g')
      .attr('class', 'events')
      .attr('transform', `translate(${config.eventsLeft}, 0)`)

    this.title = this.gOuter.append('text')
      .text(this.config.title)
      .attr('class', 'timeline-title')
      .attr('dy', '36px')    // moves horizontally due to rotation
      .attr('dx', '-0.25em') // moves vertically due to rotation
      .attr('transform', 'rotate(90,0,0)') // rotation always applied after dxy
      .attr('text-anchor', 'end')

    // Convert Date to pixel position
    this.yScale = d3.scaleTime()
      .domain([config.start, config.end])
      .range([0, 100])

    // yAxis is for consistent ticks every 10 or 100 years
    this.yAxis = d3.axisLeft(this.yScale)
      .ticks(d3.timeYear.every(10))
      .tickSizeOuter(0)
    this.yAxisGroup = this.gOuter.append('g')
      .attr('class', 'timeline-y-axis')
      .call(this.yAxis)

    // eventAxis if for event ticks
    this.eventAxis = d3.axisRight(this.yScale)
      .tickSizeOuter(0)
    this.eventAxisGroup = this.gOuter.append('g')
      .attr('class', 'timeline-event-axis')
      .call(this.eventAxis)
    
    this.mouseEmitter = new Emitter();
    /**
     * This is a stream of objects. The timeline creates an objects for each
     * mouseover event. Event objects have:
     * x - gOuter svg group x position (not resolved to MasterTimeline's xScale)
     * y - gOuter svg group y position (should be fully resolved)
     * timelineEvent - the TimelineEvent  object that the mouse passed over
     * @property {Kefir.stream} mouseoverStream
     */
    this.mouseoverStream = Kefir.fromEvents(this.mouseEmitter, 'mouseover');
    /**
     * A stream of TimelineEvents for each click
     * @property {Kefir.stream} clickStream
     */
    this.clickStream = Kefir.fromEvents(this.mouseEmitter, 'click');
    this.playPool = new Kefir.pool();
    this.pausePool = new Kefir.pool();
  }

  /**
   * @param {d3.scaleLinear} yScaleMaster - the master timelines scale is a
   *        d3.scaleLinear, that maps a year number to a pixel position.
   */
  rescale(yScaleMaster) {
    const offset = 0; // number of years to adjust timeline by
    const maxHeight = yScaleMaster.range()[1];
    let domainStart = this.config.start; // date
    let domainEnd   = this.config.end;   // date
    let rangeStart  = yScaleMaster(dateToYearFloat(domainStart)+offset); // pixels
    let rangeEnd    = yScaleMaster(dateToYearFloat(domainEnd)+offset);   // pixels

    if (rangeStart < 0) {
      domainStart = yearFloatToDate(yScaleMaster.invert(0)-offset)
      rangeStart = 0;
    }
    if (rangeEnd > maxHeight) {
      domainEnd = yearFloatToDate(yScaleMaster.invert(maxHeight)-offset);
      rangeEnd = maxHeight;
    }
    // Axis height, including clipping.
    let heightInPixels = rangeEnd - rangeStart;
    this.gOuter.attr('transform', `translate(${this.config.left},${rangeStart})`);
    this.rangeStart = rangeStart;

    this.yScale
      .domain([domainStart, domainEnd])
      .range([0, heightInPixels]);
    this.yAxis.scale(this.yScale);
    this.eventAxis.scale(this.yScale);
  }

  data(data) {
    const updateSelection = this.events
      .selectAll('text')
      .data(data, d => d.title)

    self = this;
    this.all = updateSelection.enter()
      .append('text')
      .text(d => `${d.title}`)
      .each(function(d) {
        const box = this.getBBox();
        d.width = box.width;
        d.height = box.height;
        self.playPool.plug(d.playPool);
        self.pausePool.plug(d.pausePool);
      })
      .attr('dy', '.35em')
      .attr('cursor', 'pointer')
      .on('mouseover', (d, i) => {
        this.mouseEmitter.emit('mouseover', {
          x: this.config.left + this.config.eventsLeft,
          y: this.yScale(d.date) + this.rangeStart,
          timelineEvent: d,
        });
      })
      .on('mouseout', (d, i) => { this.mouseEmitter.emit('mouseover', null) })
      .on('click',    (d, i) => { this.mouseEmitter.emit('click', d) })
      .classed('playable', (d) => d.audio || d.video)
      .merge(updateSelection) // Merge!
      .sort((a, b) => a.date - b.date)

    this.byPriority = this.all.sort((a, b) => b.p - a.p);

    // updateSelection.exit - If implemented, this should remove the element,
    // and "unplug" it from playPool and pausePool
  }

  update() {
    // A little weird to store document properties on the data. However, it
    // does gets the job done.
    this.all.each(d => {
      d.y = this.yScale(d.date);
      d.overlaps = [];
      d.hide = false;
    });

    this.all.data().forEach(function(d, i, array) {
      let next;
      while (next = array[++i]) {
        let overlap = overlapY(d, next) > 4;
        if (!overlap) break;
        next.overlaps.push(d);
        d.overlaps.push(next);
      }
    });

    this.byPriority.each(d => {
      if (d.hide) return;
      d.overlaps.forEach((obstructed) => { obstructed.hide = true; });
    });

    this.all.attr('visibility', d => d.hide ? 'hidden' : 'visible');
    this.all.filter(d => !d.hide).attr('y', d => d.y+'px');

    // Update the axes
    this.eventAxis.tickValues(this.all.data().filter(d=>!d.hide).map(d=>d.date));
    this.yAxisGroup.call(this.yAxis);
    this.eventAxisGroup.call(this.eventAxis);
  }
}
