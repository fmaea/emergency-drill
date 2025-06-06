document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const errorMessageElement = document.getElementById('login-error-message');
    const registerForm = document.getElementById('register-form');
    const registerMessageElement = document.getElementById('register-message');

    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault(); // Prevent default form submission

            const usernameInput = document.getElementById('username');
            const passwordInput = document.getElementById('password');
            const username = usernameInput ? usernameInput.value : '';
            const password = passwordInput ? passwordInput.value : '';

            if (errorMessageElement) {
                errorMessageElement.textContent = ''; // Clear previous errors
                errorMessageElement.style.display = 'none';
            }

            if (!username || !password) {
                if (errorMessageElement) {
                    errorMessageElement.textContent = '请输入用户名和密码。';
                    errorMessageElement.style.display = 'block';
                    errorMessageElement.style.color = 'red'; // Example styling
                }
                return;
            }

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ username, password }),
                });

                const responseData = await response.json();

                if (response.ok && responseData.token) {
                    localStorage.setItem('token', responseData.token);
                    // Assuming 'teacher' is the only role logging in via this form
                    localStorage.setItem('userRole', 'teacher');
                    if (responseData.teacher && responseData.teacher.fullName) {
                        localStorage.setItem('userFullName', responseData.teacher.fullName);
                    }
                     if (responseData.teacher && responseData.teacher.id) {
                        localStorage.setItem('userId', responseData.teacher.id);
                    }
                    window.location.href = 'home.html'; // Redirect to home page
                } else {
                    if (errorMessageElement) {
                        errorMessageElement.textContent = responseData.message || '登录失败，请检查您的凭据。';
                        errorMessageElement.style.display = 'block';
                        errorMessageElement.style.color = 'red';
                    }
                }
            } catch (error) {
                console.error('Login error:', error);
                if (errorMessageElement) {
                    errorMessageElement.textContent = '登录过程中发生错误，请稍后再试。';
                    errorMessageElement.style.display = 'block';
                    errorMessageElement.style.color = 'red';
                }
            }
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (event) => {
            event.preventDefault(); // Prevent default form submission

            const usernameInput = document.getElementById('reg-username');
            const fullNameInput = document.getElementById('reg-fullName');
            const passwordInput = document.getElementById('reg-password');

            const username = usernameInput ? usernameInput.value.trim() : '';
            const fullName = fullNameInput ? fullNameInput.value.trim() : '';
            const password = passwordInput ? passwordInput.value : '';

            if (registerMessageElement) {
                registerMessageElement.textContent = '';
                registerMessageElement.style.display = 'none';
            }

            if (!username || !fullName || !password) {
                if (registerMessageElement) {
                    registerMessageElement.textContent = '所有字段均为必填项。';
                    registerMessageElement.style.color = 'red';
                    registerMessageElement.style.display = 'block';
                }
                return;
            }

            if (password.length < 6) {
                if (registerMessageElement) {
                    registerMessageElement.textContent = '密码长度不能少于6位。';
                    registerMessageElement.style.color = 'red';
                    registerMessageElement.style.display = 'block';
                }
                return;
            }

            try {
                const response = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ username, fullName, password }),
                });

                const responseData = await response.json();

                if (response.status === 201) { // Successfully created
                    if (registerMessageElement) {
                        registerMessageElement.textContent = responseData.message || '注册成功！现在您可以登录了。';
                        registerMessageElement.style.color = 'green';
                        registerMessageElement.style.display = 'block';
                    }
                    registerForm.reset(); // Clear the form
                } else {
                    if (registerMessageElement) {
                        registerMessageElement.textContent = responseData.message || `注册失败 (状态: ${response.status})。`;
                        registerMessageElement.style.color = 'red';
                        registerMessageElement.style.display = 'block';
                    }
                }
            } catch (error) {
                console.error('Registration error:', error);
                if (registerMessageElement) {
                    registerMessageElement.textContent = '注册过程中发生网络错误，请稍后再试。';
                    registerMessageElement.style.color = 'red';
                    registerMessageElement.style.display = 'block';
                }
            }
        });
    }
});
