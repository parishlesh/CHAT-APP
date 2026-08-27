module.exports = {
  apps: [
    {
      name: "chat-backend",
      cwd: "./backend",
      script: "src/index.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
