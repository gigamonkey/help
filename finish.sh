#!/bin/bash

curl -X PATCH \
     -H 'Content-Type: application/json' \
     -d "{\"comment\": \"$2\"}" \
     "http://localhost:3000/help/$1/finish"