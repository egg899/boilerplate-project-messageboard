'use strict';
require('dotenv').config();
const express    = require('express');
const bodyParser = require('body-parser');
const cors       = require('cors');
const helmet     = require('helmet');
const mongoose   = require('mongoose');
const Thread     = require('./models/Thread.js');
const apiRoutes  = require('./routes/api.js');
const fccTestingRoutes = require('./routes/fcctesting.js');
const runner     = require('./test-runner');

const app = express();

// =========================
// Seguridad headers FCC
// =========================
app.use(helmet.frameguard({ action: 'sameorigin' }));       // solo iframe propio
app.use(helmet.dnsPrefetchControl({ allow: false }));       // no DNS prefetch
app.use(helmet.referrerPolicy({ policy: 'same-origin' }));  // referrer solo propio
app.use(helmet.noSniff());
app.use(helmet.hidePoweredBy());

// =========================
// Middlewares
// =========================
app.use('/public', express.static(process.cwd() + '/public'));
app.use(cors({ origin: '*' })); // solo FCC testing
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// =========================
// MongoDB
// =========================
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/messageboard', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB conectado'))
.catch(err => console.error(err));

// =========================
// THREADS ROUTES
// =========================

// GET latest 10 threads con últimas 3 replies
app.get('/api/threads/:board', async (req, res) => {
  try {
    const board = req.params.board.trim();
    const threads = await Thread.find({ board }).sort({ bumped_on: -1 }).limit(10);
    const outcome = threads.map(thread => ({
      _id: thread._id,
      text: thread.text,
      created_on: thread.created_on,
      bumped_on: thread.bumped_on,
      replies: thread.replies.slice(-3).map(r => ({
        _id: r._id,
        text: r.text,
        created_on: r.created_on
      }))
    }));
    res.json(outcome);
  } catch (err) {
    res.status(500).send('server error');
  }
});

// POST nuevo thread
app.post('/api/threads/:board', async (req, res) => {
  const { board } = req.params;
  const { text, delete_password } = req.body;
  if (!text || !delete_password) return res.status(400).json({ error: 'Missing fields' });

  const newThread = new Thread({
    board: board.trim(),
    text,
    delete_password,
    created_on: new Date(),
    bumped_on: new Date(),
    replies: []
  });
  await newThread.save();

  res.status(200).json({
    message: 'Thread creado',
    thread: {
      _id: newThread._id,
      text: newThread.text,
      created_on: newThread.created_on,
      bumped_on: newThread.bumped_on,
      replies: []
    }
  });
});

// DELETE thread
app.delete('/api/threads/:board', async (req, res) => {
  const { board } = req.params;
  const { thread_id, delete_password } = req.body;
  if (!thread_id || !delete_password) return res.status(400).send('missing fields');

  const thread = await Thread.findOne({ _id: thread_id, board });
  if (!thread) return res.send('thread not found');
  if (thread.delete_password !== delete_password) return res.send('incorrect password');

  await Thread.deleteOne({ _id: thread_id });
  res.send('success');
});

// PUT report thread
app.put('/api/threads/:board', async (req, res) => {
  const { thread_id } = req.body;
  if (!thread_id) return res.status(400).send('thread_id required');

  const thread = await Thread.findById(thread_id);
  if (!thread) return res.send('thread not found');

  thread.reported = true;
  await thread.save();
  res.send('reported');
});

// =========================
// REPLIES ROUTES
// =========================

// POST nueva reply
app.post('/api/replies/:board', async (req, res) => {
  const { thread_id, text, delete_password } = req.body;
  if (!thread_id || !text || !delete_password) return res.status(400).json({ error: 'Missing fields' });

  const thread = await Thread.findById(thread_id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });

  const newReply = { text, delete_password, created_on: new Date(), reported: false };
  thread.replies.push(newReply);
  thread.bumped_on = newReply.created_on;
  await thread.save();

  const savedThread = await Thread.findById(thread_id).lean();
  res.status(200).json({
    message: 'Reply creado',
    thread: {
      _id: savedThread._id,
      text: savedThread.text,
      created_on: savedThread.created_on,
      replies: savedThread.replies.map(r => ({
        _id: r._id,
        text: r.text,
        created_on: r.created_on
      }))
    }
  });
});

// GET todas las replies de un thread
app.get('/api/replies/:board', async (req, res) => {
  const { thread_id } = req.query;
  if (!thread_id) return res.status(400).send('thread_id required');

  const thread = await Thread.findById(thread_id).lean();
  if (!thread) return res.status(404).send('Thread not found');

  res.json({
    _id: thread._id,
    text: thread.text,
    created_on: thread.created_on,
    bumped_on: thread.bumped_on,
    replies: thread.replies.map(r => ({
      _id: r._id,
      text: r.text,
      created_on: r.created_on
    }))
  });
});

// PUT report reply
app.put('/api/replies/:board', async (req, res) => {
  const { thread_id, reply_id } = req.body;
  if (!thread_id || !reply_id) return res.status(400).send('Missing fields');

  const thread = await Thread.findById(thread_id);
  if (!thread) return res.send('thread not found');

  const reply = thread.replies.id(reply_id);
  if (!reply) return res.send('reply not found');

  reply.reported = true;
  await thread.save();
  res.send('reported');
});

// DELETE reply
app.delete('/api/replies/:board', async (req, res) => {
  const { thread_id, reply_id, delete_password } = req.body;
  if (!thread_id || !reply_id || !delete_password) return res.status(400).send('missing fields');

  const thread = await Thread.findById(thread_id);
  if (!thread) return res.send('thread not found');

  const reply = thread.replies.id(reply_id);
  if (!reply) return res.send('reply not found');
  if (reply.delete_password !== delete_password) return res.send('incorrect password');

  reply.text = '[deleted]';
  await thread.save();
  res.send('success');
});

// =========================
// Front-end routes
// =========================
app.route('/b/:board/').get((req, res) => res.sendFile(process.cwd() + '/views/board.html'));
app.route('/b/:board/:threadid').get((req, res) => res.sendFile(process.cwd() + '/views/thread.html'));
app.route('/').get((req, res) => res.sendFile(process.cwd() + '/views/index.html'));

// FCC testing & API routes
fccTestingRoutes(app);
apiRoutes(app);

// 404 middleware
app.use((req, res) => res.status(404).type('text').send('Not Found'));

// =========================
// Start server
// =========================
const listener = app.listen(process.env.PORT || 3000, function () {
  console.log('Listening on port ' + listener.address().port);
  if (process.env.NODE_ENV === 'test') {
    setTimeout(() => {
      try { runner.run(); } catch(e) { console.error(e); }
    }, 1500);
  }
});

module.exports = app;
