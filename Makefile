#
# build pcp-grafana-datasource
#
YARN=/usr/bin/nodejs-yarn
SPEC=packaging/rpm/pcp-grafana-datasource.spec

default: node_modules dist/module.js.map rpm

node_modules: package.json
	$(YARN) install

dist/module.js.map : src/module.ts src/plugin.json src/query_ctrl.ts
	$(YARN) run build
	@echo 'Note: all changes in "dist" directory must be committed'
	@git status

rpm: $(SPEC)
	packaging/rpm/make_rpms.sh
