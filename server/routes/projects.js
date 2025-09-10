const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // Adjust path to your MySQL connection pool
const authenticateToken = require('../middleware/auth'); // Adjust path to your auth middleware

// Get projects with their missions for dropdown
router.get('/projects/with-missions', authenticateToken, async (req, res) => {
  try {
    const { search = '' } = req.query;

    let query = `
      SELECT 
        p.id, 
        p.name,
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'id', pm.id,
            'name', pm.name,
            'description', pm.description,
            'order_index', pm.order_index
          )
        ) as missions
      FROM projects p
      LEFT JOIN project_missions pm ON p.id = pm.project_id
      WHERE p.created_by = ?
    `;
    const queryParams = [req.user.id];

    if (search) {
      query += ' AND p.name LIKE ?';
      queryParams.push(`%${search}%`);
    }

    query += ' GROUP BY p.id, p.name ORDER BY p.name ASC LIMIT 50';

    const [projects] = await pool.execute(query, queryParams);

    // Process results to handle JSON parsing and filter out null missions
    const processedProjects = projects.map(project => {
      let missions = [];
      try {
        missions = project.missions ? JSON.parse(project.missions).filter(m => m.id !== null) : [];
      } catch (e) {
        console.error('Error parsing missions for project', project.id, ':', e);
        missions = [];
      }
      return {
        id: project.id,
        name: project.name,
        missions
      };
    });

    res.json({
      success: true,
      data: processedProjects
    });
  } catch (error) {
    console.error('Error fetching projects with missions:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch projects and missions'
    });
  }
});

module.exports = router;