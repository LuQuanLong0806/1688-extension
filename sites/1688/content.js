(function () {
  var count = GrabCore.scanImages();
  if (!count) {
    alert('未找到1688图片！请确认在1688商品详情页上使用。');
    return 0;
  }
  return count;
})();
