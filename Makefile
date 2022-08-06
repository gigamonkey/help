SHELL := bash -O globstar

# Tool setup

eslint_opts := --format unix
eslint_strict_opts := --rule 'no-console: 1'

setup:
	npm install

start:
	npx pm2 start index.js --log help.log

restart:
	npx pm2 reload index.js

stop:
	npx pm2 delete index.js

pretty:
	prettier --write '*.js' '*.json' modules/**/*.js public/**/*.js public/**/*.css

tidy:
	tidy -config .tidyconfig public/**/*.html

lint:
	npx eslint $(eslint_opts) *.js modules/**/*.js public/**/*.js

fixmes:
	ag --no-group FIXME

ready: pretty lint


strict_lint:
	npx eslint $(eslint_opts) $(eslint_strict_opts) *.js modules/*.js

quick_lint:
	npx eslint $(eslint_opts) --fix $(shell git diff --name-only | grep '.js$$')

clean:
	find . -name '*~' -delete

pristine:
	git clean -fdx


.PHONY: setup pretty tidy lint fixmes ready strict_lint quick_lint clean pristine
