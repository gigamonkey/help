SHELL := bash -O globstar
.SUFFIXES:

setup:
	npm install

dev:
	npx nodemon --watch . -e js,ts,mjs,json,njk,html index.js

fmt:
	npm run fmt

lint:
	npm run lint

check: lint

deploy: check
	fly deploy

secrets:
	./set-secrets.sh

logs:
	fly logs

ssh:
	fly ssh console

fixmes:
	ag --no-group FIXME

clean:
	find . -name '*~' -delete

pristine:
	git clean -fdx

.PHONY: setup dev fmt lint check deploy secrets logs ssh fixmes clean pristine
