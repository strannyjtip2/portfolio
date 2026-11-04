const lb=document.getElementById('lb');document.querySelectorAll('.gallery img').forEach(i=>i.onclick=()=>{lb.firstElementChild.src=i.src;lb.hidden=false});lb.onclick=()=>lb.hidden=true;
document.querySelectorAll('[data-todo]').forEach(a=>a.onclick=e=>{e.preventDefault();alert('Контакт скоро будет добавлен')});
