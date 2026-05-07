module.exports = {
  apps: [{
    name: 'yap-web',
    cwd: '/home/yap-service/yap/apps/web',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -p 3000',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '1800M',
    env: {
      NODE_ENV: 'production',
      // Heap cap leaves ~300 MiB headroom for Node-native buffers; the
      // fine-tune decrypt path keeps a 64 MiB chunk read buffer plus a
      // ~4 MiB AES update slice on top of Next.js's working set.
      NODE_OPTIONS: '--max-old-space-size=1500',
    },
    error_file: '/home/yap-service/.pm2/logs/yap-web-error.log',
    out_file: '/home/yap-service/.pm2/logs/yap-web-out.log',
    merge_logs: true,
    time: true,
  }]
};
