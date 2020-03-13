export default class Player {
  constructor(parent) {
    this.mediaElement = null;
    this.parent = parent;
    this.div = this.parent
      .insert('div', ':first-child')
      .style('position', 'absolute')
      .attr('class', 'player')
  }

  get playing() {
    const me = this.mediaElement;
    if (!me) return false;
    return !!(me.currentTime > 0 && !me.paused && !me.ended && me.readyState > 2);
  }

  get ready() {
    if (!this.mediaElement) return false;
    return this.mediaElement.readyState > 2;
  }

  pause() {
    if (this.playing) this.mediaElement.pause();
  }

  /**
   * Ensure that the supplied media element is playing. If there is a media
   * element that is already playing, pause it. Noop if the supplied media
   * element is already playing.
   * @param {HTMLMediaElement} mediaElement - ensure this is playing.
   */
  play(mediaElement) {
    mediaElement = mediaElement || null;

    if (mediaElement !== this.mediaElement) {
      this.pause();
      this.mediaElement = mediaElement;
    }

    if (this.ready && !this.playing) this.mediaElement.play();
  }

  togglePlay(mediaElement) {
    if ((mediaElement === this.mediaElement) && this.playing) return this.pause();
    this.play(mediaElement);
  }
}
