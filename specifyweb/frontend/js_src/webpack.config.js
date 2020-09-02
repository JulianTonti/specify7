var webpack = require("webpack");

module.exports = {
    module: {
        loaders: [
            { test: /\.(png)|(gif)|(jpg)$/, loader: "url-loader?limit=100000" },
            { test: /\.css$/, loader: "style-loader!css-loader" },
            { test: /\.html$/, loader: "./underscore-template-loader.js" },
            {
                test: /\.js$/,
                exclude: /(node_modules)|(bower_components)/,
                loader: 'babel-loader',
                query: { presets: ['es2015'] }
            }
        ]
    },
    plugins: [
        new webpack.ContextReplacementPlugin(/moment[\/\\]locale$/, /en/)
    ],
    devtool: 'source-map',
    entry: {
        main: "./lib/main.js",
        login: "./lib/login.js",
        passwordchange: "./lib/passwordchange.js",
        choosecollection: "./lib/choosecollection.js",
    },
    output: {
        path: "../static/js/",
        publicPath: "/static/js/",
        filename: "[name].bundle.js"
    }
};
