// ----- IMPORTS -----
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./config/db');


// ----- APP SETUP -----
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// ----- TEST ROUTE -----
app.post('/test', (req, res) => {
  res.json({ message: 'Data received!', data: req.body });
});

// ----- SIGN UP (REGISTER) -----
app.post('/api/register', async (req, res) => {
  const { name, phone, password } = req.body;
  if (!name || !phone || !password)
    return res.status(400).json({ message: 'Missing fields' });

  try {
    // Encrypt password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert into database
    const sql = "INSERT INTO USERS (NAME, PASSWORD_HASH, PHONE, ROLE) VALUES (?, ?, ?, 'CUSTOMER')";
    db.query(sql, [name, hashedPassword, phone], (err, result) => {
      if (err) {
        console.log(err);
        return res.status(500).json({ message: 'Database error' });
      }
      res.json({ message: 'User registered successfully!' });
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ----- LOGIN -----
app.post('/api/login', (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password)
    return res.status(400).json({ message: 'Missing fields' });

  const sql = "SELECT * FROM USERS WHERE PHONE = ?";
  db.query(sql, [phone], async (err, results) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (results.length === 0)
      return res.status(400).json({ message: 'User not found' });

    const user = results[0];
    const isMatch = await bcrypt.compare(password, user.PASSWORD_HASH);

    if (!isMatch)
      return res.status(400).json({ message: 'Invalid password' });

    // Create login token
    const token = jwt.sign({ id: user.USER_ID, role: user.ROLE }, process.env.JWT_SECRET, { expiresIn: '8h' });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.USER_ID,
        name: user.NAME,
        role: user.ROLE,
        phone: user.PHONE
      }
    });
  });
});

// ----- SERVER START -----
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
