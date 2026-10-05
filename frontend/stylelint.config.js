export default {
    extends: ['stylelint-config-standard'],
    overrides: [
        {
            files: ['src/presentation/styles.css'],
            rules: {
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
