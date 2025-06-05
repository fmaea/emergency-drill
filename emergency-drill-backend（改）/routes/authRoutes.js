// 文件路径: routes/authRoutes.js

import express from 'express';
import jwt from 'jsonwebtoken';     // 用于创建 JWT
import Teacher from '../models/Teacher.js'; // 引入 Teacher 模型

const router = express.Router();

// POST /api/auth/login - 教师登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // 1. 检查用户名和密码是否提供
    if (!username || !password) {
      return res.status(400).json({ message: "请输入用户名和密码" });
    }

    // 2. 根据用户名查找教师
    const teacher = await Teacher.findOne({ username });
    if (!teacher) {
      return res.status(401).json({ message: "用户名或密码错误" }); // 注意：为安全起见，不明确指出是用户名错了还是密码错了
    }

    // 3. 比较提交的密码与数据库中存储的哈希密码
    //    这里我们使用了在 Teacher 模型中定义的 comparePassword 方法
    const isMatch = await teacher.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "用户名或密码错误" });
    }

    // 4. 如果匹配，创建 JWT
    const payload = {
      teacherId: teacher._id,         // 使用 teacher._id 作为 JWT 中的用户标识
      username: teacher.username,
      fullName: teacher.fullName
    };

    // 从环境变量中获取 JWT_SECRET，并设置过期时间
    // !! 重要: JWT_SECRET 必须是一个复杂且保密的字符串，并存储在环境变量中 !!
    const JWT_SECRET = process.env.JWT_SECRET || 'your-default-secret-key-for-dev'; // 在生产环境中务必使用环境变量
    const expiresIn = process.env.JWT_EXPIRES_IN || '1d'; // 例如 '1h', '7d'

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn });

    // 5. 将令牌和教师信息（不含密码）返回给客户端
    res.json({
      message: "登录成功！",
      token: token,
      teacher: {
        id: teacher._id,
        username: teacher.username,
        fullName: teacher.fullName
      }
    });

  } catch (error) {
    console.error('登录过程中发生错误:', error);
    res.status(500).json({ message: "服务器内部错误，请稍后再试" });
  }
});

// （可选）POST /api/auth/register - 注册新教师
// 在实际应用中，此接口可能需要管理员权限
router.post('/register', async (req, res) => {
  try {
    const { username, password, fullName } = req.body;

    // 简单验证
    if (!username || !password || !fullName) {
      return res.status(400).json({ message: "用户名、密码和全名均为必填项" });
    }
    if (password.length < 6) {
        return res.status(400).json({ message: "密码长度不能少于6位" });
    }

    // 检查用户名是否已存在
    const existingTeacher = await Teacher.findOne({ username });
    if (existingTeacher) {
      return res.status(409).json({ message: "用户名已存在" }); // 409 Conflict
    }

    // 创建新教师实例 (密码哈希会在 Teacher 模型的 pre('save') 钩子中自动完成)
    const newTeacher = new Teacher({
      username,
      password, // 明文密码，保存时会自动哈希
      fullName
    });

    await newTeacher.save();

    // 通常注册成功后不直接返回 token，而是让用户去登录页面登录
    // 但也可以选择直接返回 token 实现注册后自动登录
    res.status(201).json({
      message: "教师账户注册成功！",
      teacher: {
        id: newTeacher._id,
        username: newTeacher.username,
        fullName: newTeacher.fullName
      }
    });

  } catch (error) {
    console.error('注册过程中发生错误:', error);
    // 处理 Mongoose 验证错误 (例如，如果 unique:true 的字段重复)
    if (error.name === 'ValidationError') {
        // 从 error.errors 中提取更具体的错误信息
        const messages = Object.values(error.errors).map(val => val.message);
        return res.status(400).json({ message: messages.join(', ') });
    }
    if (error.code === 11000) { // MongoDB duplicate key error
        return res.status(409).json({ message: "用户名已存在 (duplicate key)" });
    }
    res.status(500).json({ message: "服务器内部错误，请稍后再试" });
  }
});

export default router;
