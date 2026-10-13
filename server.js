const express = require('express'), http = require('http');
const { WebSocketServer } = require('ws');
const { Telegraf, Markup } = require('telegraf');
const { Chess } = require('chess.js');
const { BOT_TOKEN, WEBAPP_URL, BOT_USERNAME } = process.env;

const app = express();
app.use(express.static('public'));
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
let waiting = null;
const rooms = {};
const send = (w, o) => w && w.readyState === 1 && w.send(JSON.stringify(o));

function start(a, b) { // a = oq, b = qora
  const r = { g: new Chess(), p: [a, b], done: false };
  a.room = b.room = r;
  send(a, { t: 'start', color: 'w', opp: b.name });
  send(b, { t: 'start', color: 'b', opp: a.name });
}
function end(r, res, why) {
  if (r.done) return;
  r.done = true;
  r.p.forEach(p => send(p, { t: 'over', res, why }));
}

wss.on('connection', ws => {
  ws.name = 'Mehmon';
  ws.on('message', d => {
    let m; try { m = JSON.parse(d); } catch { return; }
    if (m.t === 'hello') ws.name = String(m.name || 'Mehmon').slice(0, 24);
    if (m.t === 'queue') {
      if (waiting && waiting !== ws && waiting.readyState === 1) { const w = waiting; waiting = null; start(w, ws); }
      else waiting = ws;
    }
    if (m.t === 'create') {
      const c = Math.random().toString(36).slice(2, 8);
      rooms[c] = ws; ws.code = c;
      send(ws, { t: 'created', code: c, link: `https://t.me/${BOT_USERNAME}?start=${c}` });
    }
    if (m.t === 'join') {
      const h = rooms[m.code];
      if (h && h !== ws && h.readyState === 1) { delete rooms[m.code]; start(h, ws); }
      else send(ws, { t: 'err', msg: "Taklif topilmadi yoki eskirgan" });
    }
    const r = ws.room;
    if (!r || r.done) return;
    const i = r.p.indexOf(ws);
    if (m.t === 'move') {
      if (r.g.turn() !== (i ? 'b' : 'w')) return;
      let mv = null;
      try { mv = r.g.move({ from: m.from, to: m.to, promotion: 'q' }); } catch {}
      if (!mv) return send(ws, { t: 'bad' });
      r.p.forEach(p => send(p, { t: 'move', from: mv.from, to: mv.to, promotion: mv.promotion }));
      if (r.g.game_over()) {
        const mate = r.g.in_checkmate();
        end(r, mate ? (i ? 'b' : 'w') : 'd', mate ? 'Mat' : 'Durang');
      }
    }
    if (m.t === 'resign') end(r, i ? 'w' : 'b', 'Taslim bo\'ldi');
  });
  ws.on('close', () => {
    if (waiting === ws) waiting = null;
    if (ws.code) delete rooms[ws.code];
    const r = ws.room;
    if (r) end(r, r.p.indexOf(ws) ? 'w' : 'b', 'Raqib chiqib ketdi');
  });
});

if (BOT_TOKEN) {
  const bot = new Telegraf(BOT_TOKEN);
  bot.start(c => {
    const p = c.startPayload;
    const url = WEBAPP_URL + (p ? `?room=${encodeURIComponent(p)}` : '');
    c.reply(
      "♞ said.chess ga xush kelibsiz!\nShaxmat o'ynang, darslar oling va do'stlaringiz bilan bellashing.",
      Markup.inlineKeyboard([Markup.button.webApp('♟ Ilovani ochish', url)])
    );
  });
  bot.launch().catch(e => console.error(e));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
server.listen(process.env.PORT || 3000, () => console.log('said.chess ishga tushdi'));
