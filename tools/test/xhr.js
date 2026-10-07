// XMLHttpRequest-Nachbau für Node (fetch), nur GET — für die Testskripte. Schlüssel nie ausgeben: URLs werden gefiltert.
var zaehler = { n: 0 };
function maske(u) { return String(u).replace(/accessId=[^&]*/, 'accessId=***'); }
function XMLHttpRequest() { this.kopf = { 'User-Agent': 'pebble-linie8/3.0 test (privat)' }; }
XMLHttpRequest.prototype.open = function (m, u) { this.url = u; };
XMLHttpRequest.prototype.setRequestHeader = function (k, v) { this.kopf[k] = v; };
XMLHttpRequest.prototype.send = function () {
  var self = this; zaehler.n++;
  if (process.env.XHR_LOG) console.log('  XHR ' + maske(self.url).substring(0, 140));
  fetch(self.url, { headers: self.kopf }).then(function (r) {
    self.status = r.status; return r.text();
  }).then(function (t) { self.responseText = t; if (self.onload) self.onload(); })
    .catch(function (e) { if (self.onerror) self.onerror(e); });
};
module.exports = { XMLHttpRequest: XMLHttpRequest, zaehler: zaehler, maske: maske };
