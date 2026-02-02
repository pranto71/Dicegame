const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Connect to MongoDB (Replace with your actual URL in Render Env Vars)
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost/dicegame')
    .then(() => console.log("Connected to Database"))
    .catch(err => console.log(err));

// User Schema
const UserSchema = new mongoose.Schema({
    username: String,
    balance: { type: Number, default: 100 } // Virtual/Real money balance
});
const User = mongoose.model('User', UserSchema);

app.use(express.static('public'));

let onlineUsers = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Join Lobby
    socket.on('joinLobby', async (username) => {
        let user = await User.findOne({ username });
        if (!user) user = await User.create({ username });
        
        onlineUsers[socket.id] = { username: user.username, balance: user.balance };
        io.emit('updateUserList', Object.values(onlineUsers));
    });

    // Send Challenge
    socket.on('sendChallenge', (targetUser) => {
        const targetSocketId = Object.keys(onlineUsers).find(id => onlineUsers[id].username === targetUser);
        if (targetSocketId) {
            io.to(targetSocketId).emit('receiveChallenge', onlineUsers[socket.id].username);
        }
    });

    // Roll Dice Logic
    socket.on('rollDice', async (betAmount) => {
        const user = onlineUsers[socket.id];
        if (user.balance >= betAmount) {
            const roll = Math.floor(Math.random() * 6) + 1;
            let winAmount = roll >= 4 ? betAmount * 2 : 0; // Win if 4, 5, or 6
            
            // Update Database
            await User.findOneAndUpdate(
                { username: user.username }, 
                { $inc: { balance: -betAmount + winAmount } }
            );

            user.balance = user.balance - betAmount + winAmount;
            socket.emit('rollResult', { roll, newBalance: user.balance });
        }
    });

    socket.on('disconnect', () => {
        delete onlineUsers[socket.id];
        io.emit('updateUserList', Object.values(onlineUsers));
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));