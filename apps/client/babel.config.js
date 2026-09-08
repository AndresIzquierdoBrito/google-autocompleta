module.exports = function configureBabel(api) {
  api.cache(true);

  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          alias: {
            "@": "./src",
          },
          extensions: [".ios.js", ".android.js", ".web.js", ".js", ".jsx", ".ts", ".tsx"],
        },
      ],
    ],
  };
};
