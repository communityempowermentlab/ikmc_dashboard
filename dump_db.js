const mysqldump = require('mysqldump');
mysqldump({
    connection: {
        host: 'localhost',
        user: 'root',
        password: 'root',
        database: 'ikmc',
    },
    dumpToFile: 'ikmc_dump.sql',
});
