// 文件路径: models/Case.js
import mongoose from 'mongoose';

// 嵌套的 "答案选项" 子文档结构
const AnswerOptionSchema = new mongoose.Schema({
  text: { type: String, required: [true, '选项文本为必填项'] },
  isCorrect: { type: Boolean, required: true, default: false },
  rationale: { type: String } // 选项的解释说明
}, {_id: false}); // 通常子文档不需要单独的 _id，除非有特殊需求

// 嵌套的 "问题" 子文档结构
const QuestionSchema = new mongoose.Schema({
  questionText: { type: String, required: [true, '问题描述为必填项'] },
  questionType: {
    type: String,
    required: [true, '问题类型为必填项'],
    enum: [
      'MultipleChoice-Single',  // 单选题
      'MultipleChoice-Multi',   // 多选题
      'Map-Placement',          // 地图布点题
      'Binary-Decision'         // 二元决策题
      // 未来可以扩展更多类型
    ]
  },
  answerOptions: [AnswerOptionSchema], // 适用于选择题
  // 对于非选择题或复杂题型，答案可以存储为更灵活的结构
  // 例如 Map-Placement 可以是 { "coordinates": [[lat, lon], ...], "buffer": 500 }
  // Binary-Decision 正确答案可以是 true/false 或特定字符串
  correctAnswerData: { type: mongoose.Schema.Types.Mixed },
  assetUrl: { type: String, trim: true }, // 问题附带的资源URL (如图片、图表数据源)
  hint: { type: String, trim: true } // 给学生的提示信息
}, {_id: false});

// 嵌套的 "演练阶段" 子文档结构
const StageSchema = new mongoose.Schema({
  stageNumber: { type: Number, required: [true, '阶段序号为必填项'], min: 1 },
  title: { type: String, required: [true, '阶段标题为必填项'], trim: true },
  description: { type: String, trim: true }, // 阶段的简要描述或情景介绍
  questions: [QuestionSchema]
}, {_id: false});

// 主 "案例" 模型结构
const CaseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, '案例标题为必填项'],
    trim: true,
    unique: true // 假设案例标题需要唯一
  },
  description: {
    type: String,
    required: [true, '案例描述为必填项'],
    trim: true
  },
  caseType: {
    type: String,
    required: [true, '案例类型为必填项'],
    enum: ['水环境', '大气环境', '土壤环境', '综合案例'], // 根据您的home.html扩展
    trim: true
  },
  backgroundImageUrl: { // 案例的封面图片
    type: String,
    trim: true
  },
  difficulty: { // 案例难度
    type: String,
    enum: ['初级', '中级', '高级'],
    default: '中级'
  },
  estimatedTime: { // 预计完成时间 (分钟)
    type: Number,
    min: 0
  },
  learningObjectives: [{ type: String, trim: true }], // 学习目标
  stages: [StageSchema],
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Teacher' // 关联到 Teacher 模型
  },
  isPublished: { // 案例是否发布，学生可见
    type: Boolean,
    default: false
  }
}, {
  timestamps: true // 自动添加 createdAt 和 updatedAt 字段
});

// 添加索引以优化查询

CaseSchema.index({ caseType: 1 });
CaseSchema.index({ creator: 1 });
CaseSchema.index({ isPublished: 1 });


const Case = mongoose.model('Case', CaseSchema);

export default Case;
