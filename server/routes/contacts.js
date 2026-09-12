const express = require('express');
const router = express.Router();
const storage = require('../services/storageAdapter');

// @route   GET /api/contacts
// @desc    Get all phonebook contacts
router.get('/', async (req, res) => {
  try {
    const contacts = await storage.getContacts();
    res.json({ success: true, contacts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/contacts
// @desc    Save a contact
router.post('/', async (req, res) => {
  try {
    const { name, phoneNumber, userId } = req.body;
    if (!name || !phoneNumber) {
      return res.status(400).json({ success: false, message: 'Name and phoneNumber required' });
    }

    const contact = await storage.saveContact({ name, phoneNumber, userId });
    res.status(201).json({ success: true, contact });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   DELETE /api/contacts/:name
// @desc    Delete contact by name
router.delete('/:name', async (req, res) => {
  try {
    await storage.deleteContact(req.params.name);
    res.json({ success: true, message: 'Contact removed' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
