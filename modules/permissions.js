class Permissions {
  constructor(db) {
    this.db = db;
  }

  oneOf(...roles) {
    return (user) => user && roles.indexOf(user.role) >= 0;
  }

  route(predicate) {
    return (handler) => (req, res) => this.maybeDoIt(req, res, predicate, () => handler(req, res));
  }

  thunk(predicate) {
    return (req, res, thunk) => this.maybeDoIt(req, res, predicate, thunk);
  }

  maybeDoIt(req, res, predicate, thunk) {
    this.db.user(req.session.user.email, (err, user) => {
      if (err) {
        console.log(err);
        res.sendStatus(500);
      } else if (predicate(user)) {
        thunk();
      } else {
        res.sendStatus(401);
      }
    });
  }
}

export default Permissions;
