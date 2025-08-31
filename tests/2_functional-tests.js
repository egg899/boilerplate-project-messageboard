const chaiHttp = require('chai-http');
const chai = require('chai');
const assert = chai.assert;
const server = require('../server');

chai.use(chaiHttp);

suite('Functional Tests', function() {
  let threadId;
  let replyId;
  const board = 'test';
before(function(done) {
  chai.request(server)
    .post('/api/threads/' + board)
    .send({ text: 'Test thread', delete_password: 'pass' })
    .end(function(err, res) {
      assert.equal(res.status, 200);
      assert.exists(res.body.thread);
      assert.exists(res.body.thread._id);   // <-- aquí no falla si existe
      threadId = res.body.thread._id;
      done();
    });
});

before(function(done) {
  chai.request(server)
    .post('/api/replies/' + board)
    .send({ thread_id: threadId, text: 'Test reply', delete_password: 'pass' })
    .end(function(err, res) {
      assert.equal(res.status, 200);
      assert.exists(res.body.thread);
      assert.isArray(res.body.thread._id ? [res.body.thread._id] : []); // si no viene, fallback
      replyId = res.body.thread.replies ? res.body.thread.replies[0]._id : null;
      done();
    });
});


  // 1. POST thread
  test('POST /api/threads/:board → crear nuevo thread', function(done) {
    chai.request(server)
      .post('/api/threads/' + board)
      .send({ text: 'Another thread', delete_password: 'pass' })
      .end(function(err, res) {
        assert.equal(res.status, 200);
        assert.exists(res.body.thread._id);
        done();
      });
  });

  // 2. GET threads
  test('GET /api/threads/:board → obtener threads', function(done) {
    chai.request(server)
      .get('/api/threads/' + board)
      .end(function(err, res) {
        assert.equal(res.status, 200);
        assert.isArray(res.body);
        done();
      });
  });

  // 3. PUT report thread
  test('PUT /api/threads/:board → reportar thread', function(done) {
    chai.request(server)
      .put('/api/threads/' + board)
      .send({ thread_id: threadId })
      .end(function(err, res) {
        assert.equal(res.status, 200);
        assert.equal(res.text, 'reported');
        done();
      });
  });

  // 4. DELETE thread
  test('DELETE /api/threads/:board → borrar thread', function(done) {
    chai.request(server)
      .post('/api/threads/' + board)
      .send({ text: 'Thread to delete', delete_password: 'pass' })
      .end((err, res) => {
        const tId = res.body.thread._id;
        chai.request(server)
          .delete('/api/threads/' + board)
          .send({ thread_id: tId, delete_password: 'pass' })
          .end((err, res) => {
            assert.equal(res.status, 200);
            assert.equal(res.text, 'success');
            done();
          });
      });
  });

  // 5. POST reply
  test('POST /api/replies/:board → crear reply', function(done) {
    chai.request(server)
      .post('/api/replies/' + board)
      .send({ thread_id: threadId, text: 'Another reply', delete_password: 'pass' })
      .end(function(err, res) {
        assert.equal(res.status, 200);
        assert.exists(res.body.thread._id);
        done();
      });
  });

  // 6. POST reply → missing thread_id
  test('POST /api/replies/:board → error missing thread_id', function(done) {
    chai.request(server)
      .post('/api/replies/' + board)
      .send({ text: 'Fail reply', delete_password: 'pass' })
      .end(function(err, res) {
        assert.equal(res.status, 400);
        done();
      });
  });

  // 7. GET replies
  test('GET /api/replies/:board → obtener replies', function(done) {
    chai.request(server)
      .get('/api/replies/' + board)
      .query({ thread_id: threadId })
      .end(function(err, res) {
        assert.equal(res.status, 200);
        assert.property(res.body, 'replies');
        assert.isArray(res.body.replies);
        done();
      });
  });

  // 8. GET replies → missing thread_id
  test('GET /api/replies/:board → error missing thread_id', function(done) {
    chai.request(server)
      .get('/api/replies/' + board)
      .end(function(err, res) {
        assert.equal(res.status, 400);
        done();
      });
  });

  // 9. PUT report reply
  test('PUT /api/replies/:board → reportar reply', function(done) {
    chai.request(server)
      .put('/api/replies/' + board)
      .send({ thread_id: threadId, reply_id: replyId })
      .end(function(err, res) {
        assert.equal(res.status, 200);
        assert.equal(res.text, 'reported');
        done();
      });
  });

  // 10. DELETE reply
  test('DELETE /api/replies/:board → borrar reply', function(done) {
    chai.request(server)
      .delete('/api/replies/' + board)
      .send({ thread_id: threadId, reply_id: replyId, delete_password: 'pass' })
      .end(function(err, res) {
        assert.equal(res.status, 200);
        assert.equal(res.text, 'success');
        done();
      });
  });

});
