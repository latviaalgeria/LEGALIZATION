
module.exports = {
    apps: [
      {
        name: 'telegram-bot',
        script: 'C:\Users\lenovo\Downloads\script\index.js',
        watch: false,
        instances: 1,
        node_args:   '-r dotenv/config',
        autorestart: true,
        max_memory_restart: '200M',
       
        cwd: "C:\Users\lenovo\Downloads\script",

        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        error_file: 'logs/error.log',
        out_file: 'logs/output.log',
        merge_logs: true,
        time: true
      }
    ]
  };