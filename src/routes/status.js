'use strict';

const express = require('express');

function createStatusRouter() {
    const router = express.Router();

    router.get('/entry-cv', (req, res) => {
        const monitor = req.app.locals.entryCvMonitor;
        if (!monitor || typeof monitor.getSnapshot !== 'function') {
            return res.status(503).json({
                error: 'STATUS_MONITOR_UNAVAILABLE',
                message: 'Status monitor is not available.',
            });
        }
        res.set('Cache-Control', 'no-store');
        return res.json(monitor.getSnapshot());
    });

    return router;
}

module.exports = createStatusRouter;
