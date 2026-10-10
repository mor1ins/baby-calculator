export default {
    extends: ['stylelint-config-standard'],
    rules: { 'at-rule-no-unknown': [true, { ignoreAtRules: ['source', 'theme'] }] },
    overrides: [
        {
            files: ['src/presentation/styles.css'],
            rules: {
                'at-rule-no-unknown': [true, { ignoreAtRules: ['source', 'theme'] }],
                'import-notation': 'string',
                'color-no-hex': true,
                'color-named': 'never',
                'function-disallowed-list': [
                    'rgb',
                    'rgba',
                    'hsl',
                    'hsla',
                    'hwb',
                    'lab',
                    'lch',
                    'oklab',
                    'oklch',
                    'color',
                ],
            },
        },
    ],
};
