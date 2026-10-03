#!/usr/bin/env node
/**
 * Set or reset the mobile-app password for a user (run inside the backend pod).
 *   node scripts/set-app-password.js <userId> [password]   — prints the plaintext once
 *   node scripts/set-app-password.js <userId> --clear
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { hashPassword, generatePassword } = require('../src/utils/appPassword');

const [userId, arg] = process.argv.slice(2);
if (!userId) { console.error('usage: set-app-password.js <userId> [password|--clear]'); process.exit(2); }
(async () => {
    await mongoose.connect(process.env.MONGO_URI);
    const HyUser = require('../src/models/hyUserModel');
    const user = await HyUser.findOne({ userId }).select('userId');
    if (!user) { console.error(`user ${userId} not found`); process.exit(1); }
    if (arg === '--clear') {
        await HyUser.updateOne({ _id: user._id }, { $set: { appPasswordHash: '', appPasswordSetAt: null } });
        console.log(`${userId}: app password cleared`);
    } else {
        const plain = arg || generatePassword();
        await HyUser.updateOne({ _id: user._id }, { $set: { appPasswordHash: hashPassword(plain), appPasswordSetAt: new Date() } });
        console.log(`${userId}: app password set → ${plain}`);
    }
    await mongoose.disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
