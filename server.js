'use strict';
require('dotenv').config();
const express     = require('express');
const bodyParser  = require('body-parser');
const cors        = require('cors');

const apiRoutes         = require('./routes/api.js');
const fccTestingRoutes  = require('./routes/fcctesting.js');
const runner            = require('./test-runner');
const mongoose          = require('mongoose');
const Thread         = require('./models/Thread.js');
const app = express();

app.use('/public', express.static(process.cwd() + '/public'));

app.use(cors({origin: '*'})); //For FCC testing purposes only

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
// app.use(express.json());
//conexion a MongoDB
mongoose.connect('mongodb://localhost:27017/messageboard', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}) //mongoose.connect
.then(() => console.log('MongoDB conectado'))
.catch((err) => console.error(err));

app.get('/api/threads/:board', async(req, res) => {
  try{
    // const {board} = req.params;//Leer el board desde el url
    const board = req.params.board.trim();

    let outcome = [];
    // Buscar el Thread con mongoose
    const threads = await Thread.find({ board: board })
    .sort({ bumped_on:-1 })
    .limit(10);//threads limitado a 10

    //aca lo mapeamos
    threads.map(thread =>{
          const last3 = thread.replies.slice(-3);
          


          outcome.push({
                _id:thread._id,
                text:thread.text,
                created_on: thread.created_on,
                bumped_on: thread.bumped_on,
                replies: last3
              });




    }); //-->replies
    
    
    
    res.json(outcome);

  } catch(err){
    console.error(err);
    res.status(500).json({ error: "Erros del servidor" });
  }



});//app.get /api/threads/:board


app.post('/api/threads/:board', async(req,res) => {
  const { board } = req.params;
  const { text, delete_password } = req.body;

  const newThread = new Thread({
    board: board.trim(),
    text,
    delete_password,
    created_on: new Date(),
    bumped_on: new Date(),
    replies:[]
  });


  await newThread.save();
  res.json({ message: "Thread creado", thread: newThread });


});//app.post /api/threads/:board

app.post('/api/replies/:board', async(req, res) => {
  const {board} = req.params;
  const { thread_id, text, delete_password } = req.body;

  const thread = await Thread.findById(thread_id);
  if(!thread) return res.status(404).json({ error: "Thread no encontrado" });

  const replies = thread.replies;
  if(!text || !delete_password) {
  return res.status(400).json({ error: "Faltan campos obligatorios" });
}
  const newReply = {
    text,
    delete_password,
    created_on: new Date(),
    reported:false
  };
  replies.push(newReply);
  thread.bumped_on =  new Date();
  await thread.save();

   res.json({ message: "Reply creado", thread: { text: newReply.text, created_on: newReply.created_on } });
});//app.post /api/replies/:board


// app.get('/api/replies/:board', async (req, res) => {
//   const { thread_id } = req.query; // ?thread_id=ID
//   if (!thread_id) {
//     return res.status(400).json({ error: "Falta thread_id en query" });
//   }

//   const thread = await Thread.findById(thread_id);
//   if (!thread) {
//     return res.status(404).json({ error: "Thread no encontrado" });
//   }

//   res.json({
//     _id: thread._id,
//     text: thread.text,
//     created_on: thread.created_on,
//     bumped_on: thread.bumped_on,
//     replies: thread.replies
//   });
// });


app.get('/api/replies/:board', async(req, res) => {
    const { thread_id } = req.query;

    if(!thread_id) {
     return res.status(400).json({error: 'Tenes que poner un id'});
    } 

    try{
      const thread = await Thread.findById(thread_id)
        if(!thread){
          return res.status(400).json({error: 'El thread no ha sido encontrado'});
        }
        else{
          console.log(thread);
          res.status(200).json({
            _id: thread.id,
            text:thread.text,
            created_on: thread.created_on,
            bumped_on: thread.bumped_on,
            replies: thread.replies

          });
        }
    }
    catch(err){
      return res.status(400).json({ error: 'ID inválido' })
    }
    



});//app.get '/api/replies/:board'

//Ahora el PUT
app.put('/api/replies/:board', async (req, res) => {
  const { thread_id, reply_id } = req.body;

  if (!thread_id || !reply_id) {
    return res.status(400).send("thread_id and reply_id required");
  }

  try {
    const thread = await Thread.findById(thread_id);
    if (!thread) {
      return res.status(404).send("thread not found");
    }

    const reply = thread.replies.id(reply_id); // Mongoose subdocument helper
    if (!reply) {
      return res.status(404).send("reply not found");
    }

    reply.reported = true; // marcar como reportado
    await thread.save();

    return res.send("success"); // FCC espera esta respuesta exacta
  } catch (err) {
    console.error(err);
    return res.status(500).send("server error");
  }
});
//app.put '/api/replies/:board'


///Delete el Reply
app.delete('/api/replies/:board', async (req, res) => {
  const { thread_id, reply_id, delete_password } = req.body;

  try {
    // Buscar el Thread po ID
    const thread = await Thread.findById(thread_id); 
    if(!thread){
      return res.status(404).send('Thread no encontrado');
    }

    //Buscar el reply dentro del array
    const reply = thread.replies.id(reply_id);
    if(!reply){
      return res.status(404).send('Reply no encontrado');
    }

    //Verificar la contraseña
    if(reply.delete_password !== delete_password) {
      return res.send('Contraseña incorrecta');
    }

    //En vez de eliminar, reemplazar el texto por ['deleted']
    reply.text = '[deleted]';

    await thread.save();
    return res.send('Success')
  }
  catch(error){
    console.error(error);
    return res.status(500).send('Error en el servidor');
  }




}); //app.delete '/api/replies/:board'


app.delete('/api/threads/:board', async (req, res) => {
  try {
    const { board } = req.params;
    const {thread_id, delete_password } = req.body;

    if(!thread_id || !delete_password) {
      return res.status(400).send('missing fields');
    }


    //Buscar thread por ID y board
    const thread = await Thread.findOne({ _id: thread_id, board });

    if(!thread) {
      return res.status(404).send('thread not found');
    }

    if(thread.delete_password !== delete_password) {
      return res.send('incorrect password');
    }

    //Eliminar el thread y sus replies
    await Thread.deleteOne({ _id: thread_id });

    return res.send('success');

  }
  catch(error) {
    console.error(error);
    res.status(500).send('server error');
  }
});







//Mostrar todos los threads para testear
app.get('/api/threads', async (req, res) => {
  try {
    const threads = await Thread.find(); // sin filtros
    res.json(threads);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error del servidor" });
  }
});


//Sample front-end
app.route('/b/:board/')
  .get(function (req, res) {
    res.sendFile(process.cwd() + '/views/board.html');
  });
app.route('/b/:board/:threadid')
  .get(function (req, res) {
    res.sendFile(process.cwd() + '/views/thread.html');
  });

//Index page (static HTML)
app.route('/')
  .get(function (req, res) {
    res.sendFile(process.cwd() + '/views/index.html');
  });

//For FCC testing purposes
fccTestingRoutes(app);

//Routing for API 
apiRoutes(app);

//404 Not Found Middleware
app.use(function(req, res, next) {
  res.status(404)
    .type('text')
    .send('Not Found');
});

//Start our server and tests!
const listener = app.listen(process.env.PORT || 3000, function () {
  console.log('Your app is listening on port http://localhost:' + listener.address().port);
  if(process.env.NODE_ENV==='test') {
    console.log('Running Tests...');
    setTimeout(function () {
      try {
        runner.run();
      } catch(e) {
        console.log('Tests are not valid:');
        console.error(e);
      }
    }, 1500);
  }
});

module.exports = app; //for testing
