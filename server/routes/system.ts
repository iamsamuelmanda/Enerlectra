import express from 'express';
import axios from 'axios';

const router = express.Router();

// Get server's public IP address
router.get('/api/system/ip', async (req, res) => {
  try {
    // Method 1: Use external service
    const response = await axios.get('https://api.ipify.org?format=json');
    const publicIP = response.data.ip;
    
    res.json({
      publicIP,
      timestamp: new Date().toISOString(),
      service: 'Render.com',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get IP address' });
  }
});

export default router;