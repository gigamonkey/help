SHELL := bash -O globstar
.SUFFIXES:

setup:
	npm install

dev:
	npx nodemon --watch . -e js,ts,mjs,json,njk,html --exec 'node --env-file-if-exists=.env index.ts'

fmt:
	npm run fmt

lint:
	npm run lint

typecheck:
	npm run typecheck

test:
	npm test

check: lint typecheck test

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

.PHONY: setup dev fmt lint typecheck test check deploy secrets logs ssh fixmes clean pristine
