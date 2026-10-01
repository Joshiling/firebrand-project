const proxy = require('./proxy.conf.json');

if (process.env.FIREBRAND_API_PROXY_TARGET) {
  for (const route of Object.values(proxy)) {
    route.target = process.env.FIREBRAND_API_PROXY_TARGET;
  }
}

module.exports = proxy;