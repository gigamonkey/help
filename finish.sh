#!/bin/bash

curl -X PATCH \
     -H 'Content-Type: application/json' \
     -d '{"comment": "foo"}' \
     "http://localhost:3000/help/$1/finish"
