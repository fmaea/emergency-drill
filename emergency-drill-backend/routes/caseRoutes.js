// 文件路径: routes/caseRoutes.js
import express from 'express';
import Case from '../models/Case.js';
import { protect } from '../middleware/authMiddleware.js';
const router = express.Router();

// --- 案例 CRUD 操作 ---

/**
 * @route   POST /api/cases
 * @desc    创建一个新的演练案例
 * @access  Private (需要教师登录)
 */
router.post('/', protect, async (req, res) => {
  try {
    // 从请求体中获取案例数据
    // 注意：前端发送的数据结构需要与 CaseSchema 匹配，特别是 stages 和 questions 的嵌套结构
    const {
      title,
      description,
      caseType,
      backgroundImageUrl,
      difficulty,
      estimatedTime,
      learningObjectives,
      stages, // stages 应该是一个包含阶段对象的数组
      isPublished
    } = req.body;

    // 基本验证
    if (!title || !description || !caseType || !stages || stages.length === 0) {
      return res.status(400).json({ message: '案例标题、描述、类型和至少一个阶段是必填项。' });
    }
    // 还可以添加更详细的 stages 和 questions 内部结构的验证逻辑

    const newCase = new Case({
      title,
      description,
      caseType,
      backgroundImageUrl,
      difficulty,
      estimatedTime,
      learningObjectives,
      stages,
      isPublished,
      creator: req.teacher._id // 将当前登录的教师ID设为创建者
    });

    const savedCase = await newCase.save();
    res.status(201).json(savedCase);
  } catch (error) {
    console.error('创建案例失败:', error);
    if (error.name === 'ValidationError') {
      // 从 error.errors 中提取更具体的错误信息
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    if (error.code === 11000) { // MongoDB duplicate key error (例如 title unique)
        return res.status(409).json({ message: `案例标题 '${req.body.title}' 已存在.` });
    }
    res.status(500).json({ message: '服务器内部错误，创建案例失败' });
  }
});

/**
 * @route   GET /api/cases
 * @desc    获取所有已发布的案例列表 (供学生/教师选择) 或教师自己创建的案例
 * @access  Public (获取已发布的案例) / Private (获取教师自己的案例，可通过查询参数区分)
 */
router.get('/', async (req, res) => {
  try {
    // 示例：可以根据查询参数来决定是获取所有已发布的，还是特定教师的
    // 例如: GET /api/cases?published=true  或 GET /api/cases?creator=teacherId (需要配合 protect 中间件)
    // 这里我们先简单获取所有已发布的案例
    const cases = await Case.find({ isPublished: true })
                            .populate('creator', 'fullName username') // 填充创建者信息
                            .sort({ createdAt: -1 }); // 按创建时间降序
    res.json(cases);
  } catch (error) {
    console.error('获取案例列表失败:', error);
    res.status(500).json({ message: '服务器内部错误，获取案例列表失败' });
  }
});

/**
 * @route   GET /api/cases/mycases
 * @desc    获取当前登录教师创建的所有案例
 * @access  Private
 */
router.get('/mycases', protect, async (req, res) => {
    try {
        const cases = await Case.find({ creator: req.teacher._id })
                                .sort({ createdAt: -1 });
        res.json(cases);
    } catch (error) {
        console.error('获取我的案例失败:', error);
        res.status(500).json({ message: '服务器内部错误' });
    }
});


/**
 * @route   GET /api/cases/:caseId
 * @desc    获取单个案例的详细信息
 * @access  Public (如果案例已发布) / Private (如果案例未发布，则可能需要创建者权限)
 */
router.get('/:caseId', async (req, res) => {
  try {
    const caseItem = await Case.findById(req.params.caseId)
                               .populate('creator', 'fullName username');

    if (!caseItem) {
      return res.status(404).json({ message: '未找到指定的案例' });
    }

    // 权限检查：如果案例未发布，可能只允许创建者或特定角色查看
    // if (!caseItem.isPublished && (!req.teacher || req.teacher._id.toString() !== caseItem.creator._id.toString())) {
    //   return res.status(403).json({ message: '无权访问此未发布的案例' });
    // }
    // 上述权限检查需要 req.teacher, 所以此路由也可能需要 protect (或一个更宽松的认证检查)

    res.json(caseItem);
  } catch (error) {
    console.error('获取案例详情失败:', error);
    if (error.name === 'CastError' && error.kind === 'ObjectId') {
        return res.status(400).json({ message: '无效的案例ID格式' });
    }
    res.status(500).json({ message: '服务器内部错误，获取案例详情失败' });
  }
});

/**
 * @route   PUT /api/cases/:caseId
 * @desc    更新指定的演练案例
 * @access  Private (仅案例创建者)
 */
router.put('/:caseId', protect, async (req, res) => {
  try {
    const caseItem = await Case.findById(req.params.caseId);

    if (!caseItem) {
      return res.status(404).json({ message: '未找到要更新的案例' });
    }

    // 权限检查：确保只有案例的创建者才能修改
    if (caseItem.creator.toString() !== req.teacher._id.toString()) {
      return res.status(403).json({ message: '无权修改此案例，您不是创建者' });
    }

    // 从请求体中提取允许更新的字段
    const {
      title,
      description,
      caseType,
      backgroundImageUrl,
      difficulty,
      estimatedTime,
      learningObjectives,
      stages,
      isPublished
    } = req.body;

    // 更新字段
    if (title) caseItem.title = title;
    if (description) caseItem.description = description;
    if (caseType) caseItem.caseType = caseType;
    if (backgroundImageUrl !== undefined) caseItem.backgroundImageUrl = backgroundImageUrl; // 允许设置为空字符串
    if (difficulty) caseItem.difficulty = difficulty;
    if (estimatedTime !== undefined) caseItem.estimatedTime = estimatedTime;
    if (learningObjectives) caseItem.learningObjectives = learningObjectives;
    if (stages) caseItem.stages = stages; // 注意：这样会完全替换 stages 数组
    if (isPublished !== undefined) caseItem.isPublished = isPublished;

    const updatedCase = await caseItem.save();
    res.json(updatedCase);
  } catch (error) {
    console.error('更新案例失败:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    if (error.code === 11000) {
        return res.status(409).json({ message: `案例标题 '${req.body.title}' 已存在.` });
    }
    if (error.name === 'CastError' && error.kind === 'ObjectId') {
        return res.status(400).json({ message: '无效的案例ID格式' });
    }
    res.status(500).json({ message: '服务器内部错误，更新案例失败' });
  }
});

/**
 * @route   DELETE /api/cases/:caseId
 * @desc    删除指定的演练案例
 * @access  Private (仅案例创建者)
 */
router.delete('/:caseId', protect, async (req, res) => {
  try {
    const caseItem = await Case.findById(req.params.caseId);

    if (!caseItem) {
      return res.status(404).json({ message: '未找到要删除的案例' });
    }

    // 权限检查：确保只有案例的创建者才能删除
    if (caseItem.creator.toString() !== req.teacher._id.toString()) {
      return res.status(403).json({ message: '无权删除此案例，您不是创建者' });
    }

    // Mongoose 5.x 及以下版本使用 .remove()
    // await caseItem.remove();
    // Mongoose 6.x 及以上版本推荐使用 deleteOne 或 findByIdAndDelete
    await Case.findByIdAndDelete(req.params.caseId);

    res.json({ message: '案例删除成功' });
  } catch (error) {
    console.error('删除案例失败:', error);
     if (error.name === 'CastError' && error.kind === 'ObjectId') {
        return res.status(400).json({ message: '无效的案例ID格式' });
    }
    res.status(500).json({ message: '服务器内部错误，删除案例失败' });
  }
});

export default router;
