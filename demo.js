const bcrypt = require('bcrypt');

async function run() {
    const password = 'aaron1234';
    
    const hash = await bcrypt.hash(password, 10);

    console.log('Hashed Password: ', hash);
}

run();