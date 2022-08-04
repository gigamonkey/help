#!/bin/bash

curl -X POST \
     -H 'Content-Type: application/json' \
     -d '{"who": "Peter", "problem": "nothing works", "tried": "everything"}' \
     http://localhost:3000/help
