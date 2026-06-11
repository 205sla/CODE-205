'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const onlineProjectService = require('../services/onlineProjectService');

function createOnlineRouter() {
    const router = express.Router();
    router.use(requireAuth);

    router.get('/projects', (req, res) => {
        res.set('Cache-Control', 'no-store');
        res.json({ projects: onlineProjectService.listProjects(req.user.id) });
    });

    router.post('/projects', (req, res, next) => {
        try {
            const project = onlineProjectService.createProject(req.user.id, req.body);
            res.status(201).json({ project });
        } catch (error) {
            next(error);
        }
    });

    router.delete('/projects/:id', (req, res) => {
        const removed = onlineProjectService.deleteProject(req.user.id, req.params.id);
        res.json({ ok: true, removed });
    });

    return router;
}

module.exports = createOnlineRouter;
