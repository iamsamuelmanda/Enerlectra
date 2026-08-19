const Redis = require('ioredis');
const redis = new Redis(process.argv[2] || process.env.REDIS_URL);

redis.ping((err, result) => {
  if (err) {
    console.error('❌ Redis connection failed:', err.message);
    process.exit(1);
  }
  console.log('✅ Redis connected:', result);
  redis.quit();
});