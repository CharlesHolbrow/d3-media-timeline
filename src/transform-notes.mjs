import marked from 'marked';

// Links should open in a new tab. Implementation comes from here:
// https://github.com/markedjs/marked/pull/1371#issuecomment-434320596
var renderer = new marked.Renderer();
renderer.link = function(href, title, text) {
    var link = marked.Renderer.prototype.link.apply(this, arguments);
    return link.replace("<a","<a target='_blank'");
};
marked.setOptions({ renderer: renderer });

export default function(data) {
  // This method is only designed for objects
  if (Array.isArray(data)) return data;
  for (const [title, obj] of Object.entries(data)) {
    // remove and video that is not publishable (possibly due to copyright)
    if (process.env.BUILD === 'public') {
      if (obj.video && !obj.video.publishable) delete obj.video;
      if (obj.audio && !obj.audio.publishable) delete obj.audio;
    }

    const videoUrl = (obj.video && obj.video.url) || null;
    const audioUrl = (obj.audio && obj.audio.url) || null;
    const imageUrl = (obj.image && obj.image.url) || obj.imageURL || null;
    if (!obj.html)    obj.html = '';

    // CAREFUL: Look at this flippant server side unsafeness. I'm not planning
    // on adding any ability for users to submit strings, but if I do these un-
    // escaped strings will need to be sanitized.
    //
    // encodeURI() escapes double quotes, but not single quotes
    if (imageUrl) obj.html += `<img src="${encodeURI(imageUrl)}"/>`;
    if (obj.detail)   obj.html += marked(obj.detail);
  }
  return data;
}
