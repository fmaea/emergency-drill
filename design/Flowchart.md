# "环应急战" - 用户操作流程图

此流程图描述了教师和学生在V1.0版本中的核心交互路径。

```mermaid
graph TD
    subgraph "用户旅程"
        A[开始] --> B(教师: 登录);
        B --> C{教师: 打开<br/>案例库};
        C --> D[教师: 选择<br/>"水环境苯胺泄漏"案例<br/>并点击"开始推演"];
        D --> E{大屏显示<br/>"加入大厅"};
        E --> F[学生: 手机扫码<br/>加入各自小组];
        E --> G{教师: 等待<br/>所有小组加入};
        G --> H[教师: 点击<br/>"开始推演"];
        
        H --> I{推演主界面<br/>阶段一: 判别};
        I --> J[各小组提交<br/>初步判别答案];
        J --> K{教师: 点击<br/>"提交本阶段决策"};

        K --> L{推演主界面<br/>阶段二: 制定方案};
        L --> M[各小组在地图上<br/>完成布点/定项/定频次];
        M --> N{教师: 点击<br/>"提交本阶段决策"};

        N --> O{推演主界面<br/>阶段三: 跟踪监测};
        O --> P[各小组根据图表<br/>回答弹出问题];
        P --> Q{教师: 点击<br/>"提交本阶段决策"};

        Q --> R{推演主界面<br/>阶段四: 终止决策};
        R --> S[各小组做出<br/>终止响应的决策];
        S --> T{教师: 点击<br/>"完成推演，查看复盘"};

        T --> U{复盘中心};
        U --> V[教师: 对比各组方案<br/>进行讲解和总结];
        V --> W[结束];
    end

    style B fill:#264653,stroke:#fff,stroke-width:2px,color:#fff
    style C fill:#264653,stroke:#fff,stroke-width:2px,color:#fff
    style D fill:#264653,stroke:#fff,stroke-width:2px,color:#fff
    style G fill:#264653,stroke:#fff,stroke-width:2px,color:#fff
    style H fill:#2a9d8f,stroke:#fff,stroke-width:2px,color:#fff
    style K fill:#2a9d8f,stroke:#fff,stroke-width:2px,color:#fff
    style N fill:#2a9d8f,stroke:#fff,stroke-width:2px,color:#fff
    style Q fill:#2a9d8f,stroke:#fff,stroke-width:2px,color:#fff
    style T fill:#2a9d8f,stroke:#fff,stroke-width:2px,color:#fff
    style V fill:#e9c46a,stroke:#333,stroke-width:2px,color:#333
    
    subgraph "学生端 (简化流程)"
      sA[扫码] --> sB[选择队伍/输入姓名] --> sC[等待开始]
    end

    F --> sA