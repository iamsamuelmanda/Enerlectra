import express from 'express';
import axios from 'axios';

const router = express.Router();

router.get('/api/system/ip', async (req, res) => {
  try {
    const response = await axios.get('https://api.ipify.org?format=json');
    res.json({
      publicIP: response.data.ip,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get IP address' });
  }
});

export default router;