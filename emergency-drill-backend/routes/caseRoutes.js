// 文件路径: routes/caseRoutes.js
import express from 'express';
import Case from '../models/Case.js';
import { protect } from '../middleware/authMiddleware.js'; // 假设 authMiddleware.js 和 protect 函数已正确实现

const router = express.Router();

// --- 案例 CRUD 操作 ---

/**
 * @route   POST /api/cases
 * @desc    创建一个新的演练案例
 * @access  Private (需要教师登录, 由 protect 中间件处理)
 */
router.post('/', protect, async (req, res) => {
  console.log('[API] POST /api/cases - 尝试创建新案例');
  try {
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

    // 基本验证
    if (!title || !description || !caseType || !stages || !Array.isArray(stages) || stages.length === 0) {
      return res.status(400).json({ message: '案例标题、描述、类型和至少一个阶段是必填项，并且阶段必须是数组。' });
    }
    // 可以在这里添加更详细的 stages 和 questions 内部结构的验证逻辑

    const newCase = new Case({
      title,
      description,
      caseType,
      backgroundImageUrl,
      difficulty,
      estimatedTime,
      learningObjectives,
      stages,
      isPublished: isPublished || false, // 确保有默认值
      creator: req.teacher._id // protect 中间件应该会将教师信息附加到 req.teacher
    });

    const savedCase = await newCase.save();
    console.log('[API] POST /api/cases - 案例创建成功:', savedCase._id);
    res.status(201).json(savedCase);
  } catch (error) {
    console.error('[API] POST /api/cases - 创建案例失败:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ message: `数据验证失败: ${messages.join(', ')}`, errorDetails: error.errors });
    }
    if (error.code === 11000) { // MongoDB duplicate key error
        return res.status(409).json({ message: `案例标题 '${req.body.title}' 可能已存在。` });
    }
    res.status(500).json({ message: '服务器内部错误，创建案例失败', errorName: error.name, errorMessage: error.message });
  }
});

/**
 * @route   GET /api/cases
 * @desc    获取所有已发布的案例列表
 * @access  Public
 */
router.get('/', async (req, res) => {
  console.log('----------------------------------------------------');
  console.log('[API] GET /api/cases - 尝试从数据库获取所有已发布案例...');
  console.log('----------------------------------------------------');
  try {
    const cases = await Case.find({ isPublished: true })
                            .select('title description caseType backgroundImageUrl difficulty estimatedTime learningObjectives creator') // 选择需要的字段
                            .populate('creator', 'fullName username') // 尝试填充创建者信息。确保 Teacher 模型和 creator 数据有效。
                            .sort({ createdAt: -1 }); // 按创建时间降序

    console.log(`[API] GET /api/cases - 查询到 ${cases.length} 个已发布的案例。`);
    if (cases.length > 0) {
        console.log('[API] GET /api/cases - 第一个案例 (部分信息):', cases[0].title, '创建者:', cases[0].creator);
    }
    res.status(200).json(cases);
  } catch (error) {
    console.error('[API] GET /api/cases - 获取案例列表失败:', error);
    res.status(500).json({ 
        message: '服务器在获取案例列表时发生错误。', 
        errorName: error.name, 
        errorMessage: error.message
    });
  }
});

/**
 * @route   GET /api/cases/mycases
 * @desc    获取当前登录教师创建的所有案例
 * @access  Private (由 protect 中间件处理)
 */
router.get('/mycases', protect, async (req, res) => {
    console.log(`[API] GET /api/cases/mycases - 教师 ${req.teacher._id} 请求其创建的案例`);
    try {
        const cases = await Case.find({ creator: req.teacher._id })
                                .sort({ createdAt: -1 });
        console.log(`[API] GET /api/cases/mycases - 查询到 ${cases.length} 个案例。`);
        res.status(200).json(cases);
    } catch (error) {
        console.error('[API] GET /api/cases/mycases - 获取我的案例失败:', error);
        res.status(500).json({ message: '服务器内部错误，获取个人案例列表失败。', errorName: error.name, errorMessage: error.message });
    }
});


/**
 * @route   GET /api/cases/:caseId
 * @desc    获取单个案例的详细信息
 * @access  Public (如果案例已发布) / Private (创建者可访问未发布的)
 */
router.get('/:caseId', async (req, res) => {
  const { caseId } = req.params;
  console.log('=========================================================');
  console.log(`[API] GET /api/cases/${caseId} - 尝试从数据库获取单个案例...`);
  console.log('=========================================================');
  try {
    const caseItem = await Case.findById(caseId)
                               .populate('creator', 'fullName username'); // 尝试填充创建者信息

    if (!caseItem) {
      console.log(`[API] GET /api/cases/${caseId} - 未找到案例。`);
      return res.status(404).json({ message: '未找到指定ID的案例。' });
    }

    // 简单的权限：如果案例未发布，可以考虑只允许创建者访问（如果需要，需要更复杂的认证逻辑）
    // if (!caseItem.isPublished) {
    //   // 这里需要一种方式来识别当前请求用户是否为创建者
    //   // 如果有 protect 中间件，并且它能可选地附加用户信息，则可以进行判断
    //   console.log(`[API] GET /api/cases/${caseId} - 案例未发布。`);
    //   // return res.status(403).json({ message: '此案例未发布，您无权访问。' });
    // }

    console.log(`[API] GET /api/cases/${caseId} - 案例找到:`, caseItem.title);
    res.status(200).json(caseItem);
  } catch (error) {
    console.error(`[API] GET /api/cases/${caseId} - 获取案例详情失败:`, error);
    if (error.name === 'CastError' && error.kind === 'ObjectId') {
        return res.status(400).json({ message: '无效的案例ID格式。', errorName: error.name, errorMessage: error.message });
    }
    res.status(500).json({ 
        message: '服务器在获取案例详情时发生错误。',
        errorName: error.name,
        errorMessage: error.message 
    });
  }
});

/**
 * @route   PUT /api/cases/:caseId
 * @desc    更新指定的演练案例
 * @access  Private (仅案例创建者, 由 protect 中间件处理)
 */
router.put('/:caseId', protect, async (req, res) => {
  const { caseId } = req.params;
  console.log(`[API] PUT /api/cases/${caseId} - 尝试更新案例，操作者: ${req.teacher._id}`);
  try {
    const caseItem = await Case.findById(caseId);

    if (!caseItem) {
      return res.status(404).json({ message: '未找到要更新的案例。' });
    }

    if (caseItem.creator.toString() !== req.teacher._id.toString()) {
      return res.status(403).json({ message: '无权修改此案例，您不是创建者。' });
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
    if (title !== undefined) caseItem.title = title;
    if (description !== undefined) caseItem.description = description;
    if (caseType !== undefined) caseItem.caseType = caseType;
    if (backgroundImageUrl !== undefined) caseItem.backgroundImageUrl = backgroundImageUrl;
    if (difficulty !== undefined) caseItem.difficulty = difficulty;
    if (estimatedTime !== undefined) caseItem.estimatedTime = estimatedTime;
    if (learningObjectives !== undefined) caseItem.learningObjectives = learningObjectives;
    if (stages !== undefined) caseItem.stages = stages; // 注意：这样会完全替换 stages 数组
    if (isPublished !== undefined) caseItem.isPublished = isPublished;

    const updatedCase = await caseItem.save();
    console.log(`[API] PUT /api/cases/${caseId} - 案例更新成功。`);
    res.status(200).json(updatedCase);
  } catch (error) {
    console.error(`[API] PUT /api/cases/${caseId} - 更新案例失败:`, error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ message: `数据验证失败: ${messages.join(', ')}`, errorDetails: error.errors });
    }
    if (error.code === 11000) {
        return res.status(409).json({ message: `案例标题 '${req.body.title}' 可能已存在。` });
    }
    if (error.name === 'CastError' && error.kind === 'ObjectId') {
        return res.status(400).json({ message: '无效的案例ID格式。' });
    }
    res.status(500).json({ message: '服务器内部错误，更新案例失败。', errorName: error.name, errorMessage: error.message });
  }
});

/**
 * @route   DELETE /api/cases/:caseId
 * @desc    删除指定的演练案例
 * @access  Private (仅案例创建者, 由 protect 中间件处理)
 */
router.delete('/:caseId', protect, async (req, res) => {
  const { caseId } = req.params;
  console.log(`[API] DELETE /api/cases/${caseId} - 尝试删除案例，操作者: ${req.teacher._id}`);
  try {
    const caseItem = await Case.findById(caseId);

    if (!caseItem) {
      return res.status(404).json({ message: '未找到要删除的案例。' });
    }

    if (caseItem.creator.toString() !== req.teacher._id.toString()) {
      return res.status(403).json({ message: '无权删除此案例，您不是创建者。' });
    }

    await Case.findByIdAndDelete(caseId);
    console.log(`[API] DELETE /api/cases/${caseId} - 案例删除成功。`);
    res.status(200).json({ message: '案例删除成功。' });
  } catch (error) {
    console.error(`[API] DELETE /api/cases/${caseId} - 删除案例失败:`, error);
     if (error.name === 'CastError' && error.kind === 'ObjectId') {
        return res.status(400).json({ message: '无效的案例ID格式。' });
    }
    res.status(500).json({ message: '服务器内部错误，删除案例失败。', errorName: error.name, errorMessage: error.message });
  }
});

export default router;
