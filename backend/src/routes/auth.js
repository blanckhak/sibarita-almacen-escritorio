const express = require('express')
const router = express.Router()
const { login, perfil, modo, cambiarPassword } = require('../controllers/authController')
const { verificarToken } = require('../middlewares/authMiddleware')

router.post('/login', login)
router.get('/modo', modo)
router.get('/perfil', verificarToken, perfil)
router.put('/password', verificarToken, cambiarPassword)

module.exports = router
