import * as d3 from './d3.mjs';

const parseYearMonthDay = d3.timeParse('%Y-%m-%d');
const parseYearMonth = d3.timeParse('%Y-%m');
const parseYear = d3.timeParse('%Y');

export default class TimelineEvent {
  /**
   * Construct a TimelineEvent from a serializable JSON object.
   * Parse date, and add `.datePrecision` to both the datum and the `.date`
   * @param {Object} d - This is the datum that is derived from our content
   *        yaml files. It should already have a .title added.
   */
  constructor(d) {
    this.media = null;

    // Update the date
    if (typeof d.date === 'string') {
      let date;
      if (date = parseYearMonthDay(d.date)) d.datePrecision = 'day';
      else if (date = parseYearMonth(d.date)) d.datePrecision = 'month';
      else if (date = parseYear(d.date)) d.datePrecision = 'year';
      if (date) d.date = date;
    }
    else if (typeof d.date === 'number') {
      d.date = new Date(d.date, 0, 1);
      d.datePrecision = 'year';
    }
    else if (d.date instanceof Date) { // https://github.com/CharlesHolbrow/media-timelines/issues/15
      d.date = new Date(d.date.getUTCFullYear(), d.date.getUTCMonth(), d.date.getUTCDate());
      d.datePrecision = 'day';
    }
    if (typeof d.date !== 'object' || isNaN(d.date.getTime())) {
      console.error('Object is missing valid date:', d);
    }
    d.year = d.date.getFullYear();
    d.date.precision = d.datePrecision;

    // Set default "place"
    if (typeof d.p !== 'number') d.p = 0;

    this.playPool = new Kefir.pool();
    this.pausePool = new Kefir.pool();

    Object.assign(this, d);
  }

  getNode() {
    if (this.node instanceof Node) return this.node;
    this.node = document.createElement('div')
    this.selection = d3.select(this.node)
      .attr('class', 'detail')
      .html(this.html)
      .style('max-width', () => this.popupMaxWidth || null)

    if (this.video) {
      this.videoElement = document.createElement('video');
      this.videoElement.addEventListener('loadedmetadata', () => { console.log('loaded:', this.video.url); });
      this.videoPlayStream = Kefir.fromEvents(this.videoElement, 'play');
      this.videoPauseStream = Kefir.fromEvents(this.videoElement, 'pause');
      this.playPool.plug(this.videoPlayStream);
      this.pausePool.plug(this.videoPauseStream);

      d3.select(this.videoElement)
        .attr('controls', true)
        .attr('loop', () => this.video.loop ? true : null)
        .property('volume', () => typeof this.video.volume === 'number' ? this.video.volume : null)
        .append('source')
        .attr('src', () => {
          let url = this.video.url;
          if (this.video.startTime) url += `#t=${this.video.startTime}`;
          return url;
        })
      this.selection.insert(() => this.videoElement, ':first-child')

    }
    if (this.audio) {
      this.audioElement = document.createElement('audio');
      this.audioPlayStream = Kefir.fromEvents(this.audioElement, 'play');
      this.audioPauseStream = Kefir.fromEvents(this.audioElement, 'pause');
      this.playPool.plug(this.audioPlayStream);
      this.pausePool.plug(this.audioPauseStream);

      d3.select(this.audioElement)
        .attr('loop', () => this.audio.loop ? true : null)
        .property('volume', () => typeof this.audio.volume === 'number' ? this.audio.volume : null)
        .append('source')
        .attr('src', () => {
          let url = this.audio.url;
          if (this.audio.startTime) url += `#t=${this.audio.startTime}`;
          return url;
        })
    }
    return this.node;
  }
}
