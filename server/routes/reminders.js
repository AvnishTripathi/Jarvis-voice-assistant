const express = require('express');
const router = express.Router();
const storage = require('../services/storageAdapter');

// @route   GET /api/reminders
// @desc    Get all active reminders
router.get('/', async (req, res) => {
  try {
    const reminders = await storage.getReminders();
    res.json({ success: true, reminders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/reminders
// @desc    Create a new scheduled reminder
router.post('/', async (req, res) => {
  try {
    const { task, dueTimestamp, userId } = req.body;
    if (!task || !dueTimestamp) {
      return res.status(400).json({ success: false, message: 'Task and dueTimestamp are required' });
    }

    const reminder = await storage.saveReminder({
      userId: userId || null,
      task,
      dueTimestamp
    });

    res.status(201).json({ success: true, reminder });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   DELETE /api/reminders/:id
// @desc    Delete a reminder
router.delete('/:id', async (req, res) => {
  try {
    await storage.deleteReminder(req.params.id);
    res.json({ success: true, message: 'Reminder deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
