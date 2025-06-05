// 文件路径: models/Teacher.js

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';


const teacherSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, '用户名为必填项'],
    unique: true,
    trim: true
  },
  password: {
    type: String,
    required: [true, '密码为必填项'],
    minlength: [6, '密码长度不能少于6位']
  },
  fullName: {
    type: String,
    required: [true, '全名为必填项'],
    trim: true
  }
}, { timestamps: true });

// 在保存用户之前，对密码进行哈希加密
teacherSchema.pre('save', async function(next) {
  // 仅当密码被修改过（或新创建用户时）才哈希密码
  if (!this.isModified('password')) {
    return next();
  }
  try {
    // 生成盐值并哈希密码
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error); // 如果出错，传递错误给下一个中间件
  }
});

// 添加一个实例方法来比较密码
teacherSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const Teacher = mongoose.model('Teacher', teacherSchema);

export default Teacher;