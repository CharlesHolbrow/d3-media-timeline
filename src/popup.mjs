import TimelineEvent from './timeline-event.mjs';
import Emitter from 'eventemitter3';

export default class Popup {
  constructor(parent) {
    const mouseEmitter = new Emitter();

    this.mouseStream = Kefir.fromEvents(mouseEmitter, 'change');
    this.div = parent
      .append('div')
      .attr('class', 'popup')
      .on('mouseover', () => { mouseEmitter.emit('change', this) })
      .on('mouseout', () => { mouseEmitter.emit('change', null) })
  }

  setEvent(datum) {
    if (!(datum instanceof TimelineEvent)) {
      const msg = 'Popup.setEvent argument must be a TimelineEvent';
      console.log(msg, datum);
      throw new Error(msg)
    }

    const update = this.div
      .selectAll('div')
      .data([datum], (d) => { return d.title })

    update.exit().remove()
    update.enter().append((d) => { return d.getNode(); })
  }

  position(x, y) {
    // yOffset will be 0 if the popup is hidden. Call .show before .position
    const yOffset = this.div.node().offsetHeight * 0.5;
    this.div.style('transform', `translate(${x}px,${y - yOffset}px)`);
  }

  // make visible by removing 'display: none'
  show() { this.div.style('display', null); }
  hide() { this.div.style('display', 'none'); }
}