class Permissions {
  constructor(db) {
    this.db = db;
  }

  isAdmin = (user) => user.is_admin === 1;

  oneOf(...roles) {
    return (user) => user && roles.indexOf(user.role) >= 0;
  }

  route(predicate) {
    return (handler) => (req, res) => this.maybeDoIt(req, res, predicate, () => handler(req, res));
  }

  classRoute(predicate) {
    return (handler) => (req, res) => this.maybeDoItWithClass(req, res, predicate, () => handler(req, res));
  }

  thunk(predicate) {
    return (req, res, thunk) => this.maybeDoItWithClass(req, res, predicate, thunk);
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

  maybeDoItWithClass(req, res, predicate, thunk) {
    const {email} = req.session.user;
    const { class_id } = req.params;
    this.db.classMember(email, class_id, (err, user) => {
      console.log('User from classMember');
      console.log(JSON.stringify(user, null, 2));
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
