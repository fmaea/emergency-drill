// 文件路径: middleware/authMiddleware.js
import jwt from 'jsonwebtoken';
import Teacher from '../models/Teacher.js'; // 引入 Teacher 模型

const protect = async (req, res, next) => {
  let token;

  // 检查 Authorization 头部是否存在，并且是否以 'Bearer ' 开头
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // 提取 token (去掉 'Bearer ' 前缀)
      token = req.headers.authorization.split(' ')[1];

      // 验证 token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 从 token 中获取教师 ID，并从数据库中查找教师信息 (不包括密码)
      // 将教师信息附加到请求对象上，方便后续路由处理函数使用
      req.teacher = await Teacher.findById(decoded.teacherId).select('-password');

      if (!req.teacher) {
        return res.status(401).json({ message: '认证失败，用户不存在' });
      }

      next(); // Token 有效，继续执行下一个中间件或路由处理函数
    } catch (error) {
      console.error('Token 验证失败:', error.message);
      // Token 无效或已过期
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({ message: '认证失败，无效的令牌' });
      }
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ message: '认证失败，令牌已过期' });
      }
      return res.status(401).json({ message: '认证失败，请重新登录' });
    }
  }

  if (!token) {
    res.status(401).json({ message: '认证失败，未提供令牌' });
  }
};

// (可选) 检查是否为特定角色的中间件，例如管理员
// const authorize = (...roles) => {
//   return (req, res, next) => {
//     if (!req.teacher || !roles.includes(req.teacher.role)) { // 假设 Teacher 模型有 role 字段
//       return res.status(403).json({ message: '无权访问此资源' });
//     }
//     next();
//   };
// };

export { protect };