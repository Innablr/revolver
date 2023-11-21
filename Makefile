SOURCES=drivers \
		lib \
		plugins \
		revolver.js

package: revolver.zip

revolver.zip: $(SOURCES) node_modules
	zip -9rq $@ $(SOURCES) node_modules

node_modules: package.json
	npm ci --omit=dev
	touch $@

clean:
	rm -rf revolver.zip node_modules

.PHONY: clean