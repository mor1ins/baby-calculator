const layers = ['presentation', 'application', 'domain', 'infrastructure'];
const zones = [...layers, 'contracts', 'messaging', 'composition'];

module.exports = {
    forbidden: [
        { name: 'no-cycles', severity: 'error', from: {}, to: { circular: true } },
        { name: 'no-unresolved', severity: 'error', from: {}, to: { couldNotResolve: true } },
        ...zones
            .filter((zone) => zone !== 'composition')
            .map((zone) => ({
                name: `${zone}-only-own-layer-and-contracts`,
                severity: 'error',
                from: { path: `^src/${zone}/` },
                to: { path: '^src/', pathNot: `^src/(${zone}|contracts)/` },
            })),
        {
            name: 'no-unknown-source-zones',
            severity: 'error',
            from: { path: `^src/(?!(${zones.join('|')})/)` },
            to: {},
        },
        {
            name: 'no-source-dependency-on-tests-or-tooling',
            severity: 'error',
            from: { path: '^src/' },
            to: { pathNot: '^(src/|node_modules/)', dependencyTypesNot: ['core'] },
        },
        {
            name: 'pure-layers-have-no-runtime-packages',
            severity: 'error',
            from: { path: '^src/(application|domain|contracts)/' },
            to: { dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'core'] },
        },
        {
            name: 'ui-does-not-own-network-or-container',
            severity: 'error',
            from: { path: '^src/presentation/' },
            to: { path: '(^|node_modules/)(axios|ky|awilix|inversify|tsyringe)(/|$)' },
        },
        {
            name: 'react-only-at-ui-boundary',
            severity: 'error',
            from: { path: '^src/(infrastructure|messaging)/' },
            to: { path: '(^|node_modules/)(react|react-dom)(/|$)' },
        },
    ],
    options: {
        doNotFollow: { path: 'node_modules' },
        enhancedResolveOptions: { extensions: ['.js', '.jsx', '.json'] },
    },
};
