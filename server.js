/**
 * Свой сигнальный сервер для ARENA (замена облачного 0.peerjs.com).
 *
 * Это НЕ игровой сервер — он нужен только на пару секунд в момент
 * установления P2P-соединения (обмен SDP/ICE), сама игра дальше идёт
 * напрямую между браузерами (WebRTC DataChannel). Поэтому сервер лёгкий
 * и не требует много ресурсов — хватит самого дешёвого VPS.
 *
 * Настройки ниже можно переопределить переменными окружения, чтобы
 * не редактировать код на сервере:
 *   PORT          - порт, который слушает сервер (по умолчанию 9000)
 *   PEER_PATH     - путь PeerJS-протокола (по умолчанию '/')
 *   PEER_KEY      - общий "ключ" клиент<->сервер (по умолчанию 'arena-duel')
 *   ALLOW_ORIGIN  - список разрешённых Origin через запятую, '*' - все
 */

const express = require('express');
const { ExpressPeerServer } = require('peer');

const PORT = process.env.PORT || 9000;
const PEER_PATH = process.env.PEER_PATH || '/';
const PEER_KEY = process.env.PEER_KEY || 'arena-duel';
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';

const app = express();

// CORS — страница с игрой открывается либо просто как локальный файл
// (origin "null"), либо с другого домена, поэтому разрешаем кросс-доменные
// запросы к служебным HTTP-эндпоинтам PeerJS (не к самому WebRTC-трафику,
// он идёт напрямую между браузерами). ВАЖНО: этот middleware должен стоять
// ДО роутов ниже — иначе Express успевает ответить на "/" и "/health" до
// того, как заголовок вообще выставится, и браузер блокирует ответ по CORS
// (именно так и было раньше — баг).
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Простой health-check — удобно для мониторинга/хостинга (Render, Railway,
// UptimeRobot и т.п. обычно дергают "/", чтобы понять, что сервис жив).
app.get('/', (req, res) => {
  res.status(200).send('ARENA signaling server is running');
});

app.get('/health', (req, res) => {
  res.status(200).json({ ok: true, uptime: process.uptime() });
});

const server = app.listen(PORT, () => {
  console.log(`[arena-peer-server] слушаю порт ${PORT}, path=${PEER_PATH}, key=${PEER_KEY}`);
});

const peerServer = ExpressPeerServer(server, {
  path: PEER_PATH,
  key: PEER_KEY,
  // allow_discovery выключен: список всех подключённых id никому кроме
  // самих участников дуэли знать не нужно, это чуть безопаснее.
  allow_discovery: false,
  proxied: true, // важно, если сервер стоит за Nginx/другим reverse-proxy
});

app.use(PEER_PATH === '/' ? '/' : PEER_PATH, peerServer);

peerServer.on('connection', (client) => {
  console.log(`[arena-peer-server] connect:    ${client.getId()}`);
});

peerServer.on('disconnect', (client) => {
  console.log(`[arena-peer-server] disconnect: ${client.getId()}`);
});

peerServer.on('error', (err) => {
  console.error('[arena-peer-server] error:', err);
});

process.on('SIGTERM', () => {
  console.log('[arena-peer-server] SIGTERM, завершаюсь...');
  server.close(() => process.exit(0));
});
